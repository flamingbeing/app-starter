// The push module's rules case, loaded by app/test/rules.test.mjs: the devices and the queue are the Worker's alone.

export function tests({ test, assert, emu, as }) {
  test('push: no page reads or writes the devices, their owners or the queue, whatever its role', async () => {
    await emu.clear();
    await emu.seed('pushSubs/u-member/devices/d1', { endpoint: 'https://web.push.apple.com/x', p256dh: 'p', auth: 'a', createdAt: 1 });
    await emu.seed('pushDevices/d1', { uid: 'u-member' });
    await emu.seed('pushQueue/u-member_1', { uid: 'u-member', key: 'k', at: 1, title: 't', body: 'b', itemId: 'x', stamp: 's' });
    for (const role of ['admin', 'member', 'viewer']) {
      const u = as(role);
      assert.equal((await u.get('pushSubs/u-member/devices/d1')).ok, false, `${role} reads a device`);
      assert.equal((await u.set(`pushSubs/u-${role}/devices/d2`, { endpoint: 'https://x', p256dh: 'p', auth: 'a', createdAt: 1 })).ok, false, `${role} writes its own device`);
      assert.equal((await u.get('pushDevices/d1')).ok, false, `${role} reads a device owner`);
      assert.equal((await u.set('pushDevices/d2', { uid: `u-${role}` })).ok, false, `${role} writes a device owner`);
      assert.equal((await u.get('pushQueue/u-member_1')).ok, false, `${role} reads the queue`);
      assert.equal((await u.set(`pushQueue/u-${role}_2`, { uid: `u-${role}`, key: 'k', at: 1, title: 't', body: 'b', itemId: 'x', stamp: 's' })).ok, false, `${role} writes the queue`);
      assert.equal((await u.delete('pushQueue/u-member_1')).ok, false, `${role} deletes from the queue`);
    }
    assert.equal((await emu.as('u-new', {}).get('pushDevices/d1')).ok, false, 'no role, no access');
  });
}
