import importlib.util
import pathlib
import tempfile
import unittest
from contextlib import ExitStack, redirect_stdout
from io import StringIO
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('online_manage', pathlib.Path(__file__).with_name('manage.py'))
manage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manage)


class OperationTests(unittest.TestCase):
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
            with patch.object(manage, 'PREFIX', root), patch.object(manage, 'revision', return_value=root / ('b' * 40)), patch.object(manage, 'idle'), patch.object(manage, 'save'), patch.object(manage, 'run') as run, patch.object(manage, 'wait_ready', side_effect=[RuntimeError('not ready'), None]):
                with self.assertRaises(RuntimeError):
                    manage.activate('b' * 40)
                self.assertEqual((root / 'current').resolve(), old.resolve())
                self.assertEqual(run.call_count, 2)
                for call in run.call_args_list:
                    self.assertEqual(call.args, ('systemctl', 'restart', 'cartridge-strike2-pilot'))

    def test_reconnecting_room_blocks_activation_before_any_mutation(self):
        with patch.object(manage, 'health', return_value={'players': 0, 'rooms': 1}), patch.object(manage, 'revision'), patch.object(manage, 'save') as save, patch.object(manage, 'point') as point, patch.object(manage, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'reserved'):
                manage.activate('b' * 40)
            save.assert_not_called()
            point.assert_not_called()
            run.assert_not_called()
        with patch.object(manage, 'health', return_value={'players': 0, 'rooms': 0}):
            manage.idle()

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
            stack.enter_context(patch.object(manage.urllib.request, 'urlopen', return_value=response))
            stack.enter_context(patch.object(manage, 'verify', side_effect=RuntimeError('verification failed')))
            with self.assertRaisesRegex(RuntimeError, 'verification failed'):
                manage.configure_named('https://game.example.org', str(token))
            self.assertEqual(sorted(p.name for p in manage.CONFIG.iterdir()), ['invite.env', 'until'])
            self.assertEqual((manage.CONFIG / 'invite.env').read_text(), 'private-fixture')
            self.assertEqual((drop / 'local.conf').read_text(), 'original')
            self.assertFalse((drop / 'named.conf').exists())
            self.assertFalse((manage.SYSTEMD / (manage.TUNNEL + '.service.d')).exists())
            self.assertTrue(all('cartridge-strike2' not in call.args for call in run.call_args_list))


if __name__ == '__main__':
    unittest.main()
