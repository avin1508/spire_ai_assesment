// Push notification decisions: when to ask permission, when to (re-)register
// the device for its owner, and where a tapped notification leads.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSION_PROMPT_COOLDOWN_MS, notificationTarget, permissionState, shouldOfferPermission, shouldRegister } from '../src/utils/pushNotifications.js';

describe('permission and registration', () => {
  const base = { supported: true, permission: 'granted', token: 'fcm-token-1', owner: 'guest', registered: null };

  test('Android "never asked" (denied + canAskAgain) counts as undetermined', () => {
    assert.equal(permissionState({ status: 'denied', canAskAgain: true }), 'undetermined');
    assert.equal(permissionState({ status: 'denied', canAskAgain: false }), 'denied');
    assert.equal(permissionState({ status: 'undetermined', canAskAgain: true }), 'undetermined');
    assert.equal(permissionState({ status: 'granted', canAskAgain: true }), 'granted');
  });

  test('notifications are offered only after a profile is confirmed, while still undecided', () => {
    const offer = { supported: true, permission: 'undetermined', reason: 'profile_confirmed', dismissedAt: null };
    assert.equal(shouldOfferPermission(offer), true);
    assert.equal(shouldOfferPermission({ ...offer, reason: 'owner' }), false, 'not on start-up / sign-in');
    assert.equal(shouldOfferPermission({ ...offer, permission: 'granted' }), false, 'already allowed');
    assert.equal(shouldOfferPermission({ ...offer, permission: 'denied' }), false, 'blocked by the system: never nag');
    assert.equal(shouldOfferPermission({ ...offer, supported: false }), false, 'Expo Go / iOS');
  });

  test('"Not now" is respected for a week', () => {
    const now = Date.UTC(2026, 9, 25);
    const offer = { supported: true, permission: 'undetermined', reason: 'profile_confirmed', now };
    assert.equal(shouldOfferPermission({ ...offer, dismissedAt: now - 3600000 }), false, 'an hour ago');
    assert.equal(shouldOfferPermission({ ...offer, dismissedAt: now - PERMISSION_PROMPT_COOLDOWN_MS + 1 }), false);
    assert.equal(shouldOfferPermission({ ...offer, dismissedAt: now - PERMISSION_PROMPT_COOLDOWN_MS }), true, 'after 7 days');
  });

  test('a guest device registers once; nothing without permission, token or support', () => {
    assert.equal(shouldRegister(base), true);
    assert.equal(shouldRegister({ ...base, registered: { owner: 'guest', token: 'fcm-token-1' } }), false, 'already registered');
    assert.equal(shouldRegister({ ...base, permission: 'denied' }), false);
    assert.equal(shouldRegister({ ...base, permission: 'undetermined' }), false);
    assert.equal(shouldRegister({ ...base, token: null }), false);
    assert.equal(shouldRegister({ ...base, supported: false }), false);
  });

  test('login, logout and token rotation register the device again for the new owner', () => {
    const asGuest = { owner: 'guest', token: 'fcm-token-1' };
    assert.equal(shouldRegister({ ...base, owner: 'user:a1', registered: asGuest }), true, 'login: guest → account');
    assert.equal(shouldRegister({ ...base, owner: 'guest', registered: { owner: 'user:a1', token: 'fcm-token-1' } }), true, 'logout: account → fresh guest');
    assert.equal(shouldRegister({ ...base, owner: 'user:b2', registered: { owner: 'user:a1', token: 'fcm-token-1' } }), true, 'switching accounts');
    assert.equal(shouldRegister({ ...base, token: 'fcm-token-2', registered: asGuest }), true, 'rotated token');
  });
});

describe('notification tap', () => {
  test('"recommendations ready" opens Jobs › Recommended', () => {
    assert.deepEqual(notificationTarget({ type: 'recommendations_ready', recommendationId: 'r1', count: '15' }), {
      name: 'Main',
      params: { screen: 'Jobs', params: { screen: 'Recommended' } },
    });
  });

  test('anything else (or nothing) opens nothing', () => {
    assert.equal(notificationTarget({ type: 'something_else' }), null);
    assert.equal(notificationTarget(null), null);
    assert.equal(notificationTarget(undefined), null);
  });
});
