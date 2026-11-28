import importlib.util
import pathlib
import tempfile
import unittest
from contextlib import ExitStack, redirect_stdout, nullcontext
from io import StringIO
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('online_manage', pathlib.Path(__file__).with_name('manage.py'))
manage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manage)


class OperationTests(unittest.TestCase):
    def setUp(self):
        private = tempfile.TemporaryDirectory()
        self.addCleanup(private.cleanup)
        self.backups = pathlib.Path(private.name) / 'backups'
        self.backups.mkdir()
        self.saved = self.backups / 'snapshot'
        self.saved.mkdir()
        patcher = patch.object(manage, 'BACKUPS', self.backups)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_active_players_prevent_interruption(self):
        with patch.object(manage, 'health', return_value={'players': 1}):
            with self.assertRaises(RuntimeError):
                manage.idle()

    def test_activation_failure_restores_original_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            old = root / ('a' * 40)
            old.mkdir()
            (root / 'current').symlink_to(old)
            with patch.object(manage, 'PREFIX', root), patch.object(manage, 'revision', side_effect=lambda value:root/value), patch.object(manage, 'idle'), patch.object(manage, 'fence_admissions', return_value=nullcontext()), patch.object(manage, 'confirm_idle'), patch.object(manage, 'save', return_value=self.saved), patch.object(manage, 'run') as run, patch.object(manage, 'wait_ready', side_effect=[RuntimeError('not ready'), None]):
                with self.assertRaises(RuntimeError):
                    manage.activate('b' * 40)
                self.assertEqual((root / 'current').resolve(), old.resolve())
                self.assertEqual([call.args for call in run.call_args_list], [
                    ('systemctl', 'restart', manage.SERVICE),
                    ('systemctl', 'stop', manage.SERVICE),
                    ('systemctl', 'restart', manage.SERVICE)])

    def test_reconnecting_room_blocks_activation_before_any_mutation(self):
        with patch.object(manage, 'health', return_value={'players': 0, 'rooms': 1}), patch.object(manage, 'revision'), patch.object(manage, 'save') as save, patch.object(manage, 'point') as point, patch.object(manage, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'reserved'):
                manage.activate('b' * 40)
            save.assert_not_called()
            point.assert_not_called()
            run.assert_not_called()
        with patch.object(manage, 'health', return_value={'players': 0, 'rooms': 0}):
            manage.idle()

    def test_late_room_aborts_under_fence_before_switch(self):
        with ExitStack() as stack:
            stack.enter_context(patch.object(manage, 'revision', return_value=pathlib.Path('/test/next')))
            stack.enter_context(patch.object(manage, 'idle'))
            stack.enter_context(patch.object(manage, 'save'))
            fence = stack.enter_context(patch.object(manage, 'fence_admissions', return_value=nullcontext()))
            stack.enter_context(patch.object(manage, 'confirm_idle', side_effect=RuntimeError('reserved')))
            point = stack.enter_context(patch.object(manage, 'point'))
            with self.assertRaisesRegex(RuntimeError, 'reserved'):
                manage.activate('b' * 40)
            fence.assert_called_once()
            point.assert_not_called()

    def test_public_probe_failure_drains_before_verified_return(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root = pathlib.Path(directory)
            before, candidate = root / ('a' * 40), root / ('b' * 40)
            before.mkdir()
            (candidate / 'shared/multiplayer').mkdir(parents=True)
            (candidate / 'shared/multiplayer/build.mjs').write_text('export const CONTRACT=Object.freeze({"protocolVersion":22});')
            (root / 'current').symlink_to(before)
            stack.enter_context(patch.object(manage, 'PREFIX', root))
            stack.enter_context(patch.object(manage, 'revision', side_effect=lambda value:root/value))
            stack.enter_context(patch.object(manage, 'idle'))
            stack.enter_context(patch.object(manage, 'save', return_value=self.saved))
            stack.enter_context(patch.object(manage, 'fence_admissions', side_effect=lambda:nullcontext()))
            confirm = stack.enter_context(patch.object(manage, 'confirm_idle'))
            stack.enter_context(patch.object(manage, 'wait_ready'))
            stack.enter_context(patch.object(manage, 'health', side_effect=[
                {'contract':{'protocolVersion':22}}, {'rooms':1, 'players':1}, {'rooms':1, 'players':0},
                {'rooms':0, 'players':0}, {'rooms':0, 'players':0}, {'rooms':1, 'players':0},
                {'rooms':0, 'players':0}, {'rooms':0, 'players':0}, {'rooms':0, 'players':0}]))
            verify = stack.enter_context(patch.object(manage, 'verify', side_effect=[RuntimeError('public proof failed'),None]))
            run = stack.enter_context(patch.object(manage, 'run'))
            def wait_for_user(_):
                self.assertEqual((root/'current').resolve(), candidate)
                self.assertFalse(any(c.args[1]=='stop' for c in run.call_args_list))
            sleep = stack.enter_context(patch.object(manage.time, 'sleep', side_effect=wait_for_user))
            with self.assertRaisesRegex(RuntimeError, 'public proof failed'):
                manage.activate(candidate.name)
            self.assertEqual([call.args[0] for call in sleep.call_args_list], [5,5,1,5,1])
            self.assertEqual(confirm.call_count,1)
            self.assertEqual(verify.call_count,2)
            self.assertEqual((root/'current').resolve(),before)
            self.assertTrue((self.saved/'rollback-verified').is_file())

    def test_dead_authority_can_roll_back_but_unobservable_live_process_remains_pending(self):
        with patch.object(manage, 'health', side_effect=ConnectionRefusedError()), patch.object(manage,'run') as run:
            run.return_value.stdout='ActiveState=failed\nSubState=failed\nMainPID=0'
            self.assertTrue(manage.rollback_idle())
            run.return_value.stdout='ActiveState=active\nSubState=running\nMainPID=123'
            with self.assertRaisesRegex(RuntimeError,'Cutover saved'):
                manage.rollback_idle()

    def test_orphaned_manager_preserves_live_rooms_and_recovers_a_stopped_candidate(self):
        record={'phase':'checking-public','previous':'a'*40,'candidate':'b'*40,'backup':'snapshot','owner':None}
        manage.store_transition(record,'checking-public')
        with patch.object(manage,'stable_rollback_idle',side_effect=[False,True]), patch.object(manage,'restore_previous') as restore:
            manage.recover_interrupted_fence()
            restore.assert_not_called()
            self.assertIn('rollback-pending',manage.pending_path().read_text())
            manage.recover_interrupted_fence()
            restore.assert_called_once()

    def test_immutable_operations_required(self):
        with self.assertRaisesRegex(RuntimeError, 'immutable operations'):
            manage.require_installed_operations()

    def test_named_route_rejects_quick_tunnel_and_userinfo(self):
        for host in ['http://game.example.org', 'https://test.trycloudflare.com', 'https://user@game.example.org', 'https://game.example.org/path']:
            with self.assertRaises(ValueError):
                manage.named_config(host, '/does-not-need-reading')

    def test_revoke_replaces_only_private_invitation(self):
        with tempfile.TemporaryDirectory() as directory, redirect_stdout(StringIO()) as output:
            root = pathlib.Path(directory)
            (root / 'invite.env').write_text('CS2_PILOT_INVITE=old-private-test-value\n')
            with patch.object(manage, 'CONFIG', root), patch.object(manage, 'idle'), patch.object(manage, 'save'), patch.object(manage, 'run') as run, patch.object(manage, 'wait_ready'), patch.object(manage, 'verify'):
                manage.revoke()
                code = (root / 'invitation.txt').read_text()
                self.assertNotEqual(code, 'old-private-test-value')
                self.assertEqual((root / 'invite.env').read_text(), 'CS2_PILOT_INVITE=' + code + '\n')
                self.assertEqual((root / 'invite.env').stat().st_mode & 0o777, 0o600)
                self.assertNotIn(code, output.getvalue())
                run.assert_called_once_with('systemctl', 'restart', 'cartridge-strike2-pilot')

    def test_stop_public_disables_only_connector(self):
        with patch.object(manage, 'idle') as idle, patch.object(manage, 'run') as run, redirect_stdout(StringIO()):
            manage.stop_public()
            idle.assert_called_once()
            run.assert_called_once_with('systemctl', 'disable', '--now', 'cartridge-strike2-tunnel')

    def test_named_verification_failure_restores_private_config_and_dropins(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root = pathlib.Path(directory)
            for key in ['CONFIG', 'BACKUPS', 'SYSTEMD', 'PREFIX']:
                target = root / key
                target.mkdir()
                stack.enter_context(patch.object(manage, key, target))
            (manage.CONFIG / 'invite.env').write_text('private-fixture')
            (manage.CONFIG / 'until').write_text('1234')
            (manage.PREFIX / 'current').symlink_to(root / 'old-release')
            drop = manage.SYSTEMD / (manage.SERVICE + '.service.d')
            drop.mkdir()
            (drop / 'local.conf').write_text('original')
            token = root / 'test-token'
            token.write_text('x' * 64)
            stack.enter_context(patch.object(manage, 'idle'))
            run = stack.enter_context(patch.object(manage, 'run'))
            stack.enter_context(patch.object(manage, 'wait_ready'))
            response = MagicMock()
            response.__enter__.return_value.status = 200
            urlopen = stack.enter_context(patch.object(manage.urllib.request, 'urlopen', return_value=response))
            stack.enter_context(patch.object(manage, 'verify', side_effect=RuntimeError('verification failed')))
            with self.assertRaisesRegex(RuntimeError, 'verification failed'):
                manage.configure_named('https://game.example.org', str(token))
            request = urlopen.call_args.args[0]
            self.assertEqual(request.full_url, 'https://game.example.org')
            self.assertEqual(request.get_header('User-agent'), 'CartridgeStrike2-Readiness/1.0')
            self.assertEqual(sorted(p.name for p in manage.CONFIG.iterdir()), ['invite.env', 'until'])
            self.assertEqual((manage.CONFIG / 'invite.env').read_text(), 'private-fixture')
            self.assertEqual((drop / 'local.conf').read_text(), 'original')
            self.assertFalse((drop / 'named.conf').exists())
            self.assertFalse((manage.SYSTEMD / (manage.TUNNEL + '.service.d')).exists())
            self.assertTrue(all('cartridge-strike2' not in call.args for call in run.call_args_list))


if __name__ == '__main__':
    unittest.main()
