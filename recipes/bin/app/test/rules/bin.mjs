// The bin module's rules case, loaded by app/test/rules.test.mjs: writers remove an entry (restore, purge); viewers cannot.
// space(role): the space that role's test account works in ('_', or its own uid in a personal app).

export function tests({ test, assert, emu, as, space = () => '_' }) {
  test('bin: a writer removes an entry (restore, purge for good); a viewer only reads', async () => {
    await emu.clear();
    const entry = { id: 'a', kind: 'tasks', data: { id: 'a', text: 'ok' }, deletedAt: 2, updatedAt: 2 };
    const bin = (role, id) => `spaces/${space(role)}/bin/tasks:${id}`;
    assert.equal((await as('member').set(bin('member', 'a'), entry, { serverAt: true })).ok, true);
    await emu.seed(bin('viewer', 'a'), entry);
    assert.equal((await as('viewer').delete(bin('viewer', 'a'))).ok, false, 'viewers cannot purge');
    assert.equal((await as('viewer').get(bin('viewer', 'a'))).ok, true);
    assert.equal((await as('member').delete(bin('member', 'a'))).ok, true);
    assert.equal((await as('admin').set(bin('admin', 'b'), entry, { serverAt: true })).ok, true);
    assert.equal((await as('admin').delete(bin('admin', 'b'))).ok, true);
    assert.equal((await emu.as('u-new', {}).delete(bin('member', 'a'))).ok, false, 'no role, no access');
    if (space('member') !== '_') {
      await emu.seed(bin('member', 'c'), entry);
      assert.equal((await as('admin').delete(bin('member', 'c'))).ok, false, 'not someone else’s, admins included');
    }
  });
}
