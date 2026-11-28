import assert from 'node:assert/strict';

export async function rememberedFamilyForm(page) {
  await page.locator('#network-name').waitFor();
  await page.getByText('This device remembers access to this room.', {exact:false}).waitFor();
  const password = page.locator('#network-code');
  assert(await password.isHidden(), 'Remembered family access hides the password');
  assert.equal(await password.inputValue(), '');
  assert.equal(await password.evaluate(input => input.required), false);
}
