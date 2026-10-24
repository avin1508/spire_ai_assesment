import { GuestLink } from '../models/guestLink.model.js';
import { Profile } from '../models/profile.model.js';
import { Resume } from '../models/resume.model.js';
import { Recommendation } from '../models/recommendation.model.js';
import { findCurrentResume } from './resumes.service.js';
import { userOwnerKey } from './auth.service.js';
import { HttpError } from '../utils/httpErrors.js';

// Links a guest session's data to a signed-in account.
//
// Who: the account comes from the verified session, the guest from the
// X-Guest-Session the app proves it holds (middleware/owner.js). A guest
// session can be linked to one account only (unique GuestLink.guestKey);
// any other account gets 409 guest_already_linked.
//
// What (decided on the first attempt and saved, so retries follow the same plan):
//   profile  — the account has no Profile document: the guest's profile
//              document is re-keyed to the account (one atomic update, so it
//              is moved, never copied or merged) → 'linked'.
//              The account already has a Profile document: it is not touched
//              at all; the guest's stays where it is → 'kept'.
//              No guest profile → 'none'.
//   resume   — the guest's current confirmed resume moves to the account as
//              its current resume only if the account had neither a Profile
//              document nor a resume ('linked'). Otherwise it moves as an
//              archived resume ('retained'): kept, never the current one, so
//              the account's own resume and profile are never replaced.
//   recommendations — move with a linked profile (they were made from it);
//              one the account already has for the same profile version is
//              left with the guest. Not moved when the profile was kept.
//
// No MongoDB transaction (the dev/test databases are standalone servers):
// every step is a single-document conditional update keyed on the guest
// owner, so it is idempotent; each decision is written to GuestLink before
// the step runs, and the link is 'completed' only after all steps. A retry
// after a failure at any point resumes the same plan without losing or
// duplicating anything. Nothing of the guest's is deleted.

// Test seam: called after each step ('claim', 'profile', 'resume', 'recommendations').
let afterStep = async () => {};
export function setLinkStepHook(hook) {
  const previous = afterStep;
  afterStep = hook ?? (async () => {});
  return () => {
    afterStep = previous;
  };
}

const summary = (link) => ({
  status: link.status,
  profile: link.profile,
  resume: link.resume,
  recommendations: link.recommendationIds.length,
});

async function claim(guestKey, userId) {
  const existing = await GuestLink.findOne({ guestKey });
  if (existing) return existing;
  const accountHadProfile = Boolean(await Profile.exists({ ownerKey: userOwnerKey(userId) }));
  try {
    return await GuestLink.create({ guestKey, userId, accountHadProfile });
  } catch (error) {
    if (error?.code === 11000) return GuestLink.findOne({ guestKey }); // a concurrent request won
    throw error;
  }
}

async function linkProfile(link, guestKey, userKey) {
  if (link.profile) return;
  let result = 'none';
  if (link.accountHadProfile) {
    result = (await Profile.exists({ ownerKey: guestKey })) ? 'kept' : 'none';
  } else {
    try {
      const moved = await Profile.updateOne(
        { ownerKey: guestKey },
        { $set: { ownerType: 'user', ownerKey: userKey, userId: link.userId } }
      );
      if (moved.modifiedCount === 1) result = 'linked';
      // Already moved by an earlier attempt that stopped before saving the result.
      else if (await Profile.exists({ ownerKey: userKey, userId: link.userId })) result = 'linked';
    } catch (error) {
      if (error?.code !== 11000) throw error;
      result = 'kept'; // the account got its own profile in the meantime: left untouched
    }
  }
  link.profile = result;
  await link.save();
}

async function linkResume(link, guestKey, userKey) {
  if (!link.resume) {
    const guestResume = await findCurrentResume(guestKey);
    if (!guestResume) {
      link.resume = 'none';
    } else {
      const accountResume = await findCurrentResume(userKey);
      link.resume = !link.accountHadProfile && !accountResume ? 'linked' : 'retained';
      link.resumeId = guestResume._id;
    }
    await link.save(); // the decision is saved before the move
  }
  if (link.resume === 'none') return;
  await Resume.updateOne(
    { _id: link.resumeId, ownerKey: guestKey },
    {
      $set: {
        ownerType: 'user',
        ownerKey: userKey,
        ...(link.resume === 'retained' ? { archivedAt: new Date() } : {}),
      },
    }
  );
}

async function linkRecommendations(link, guestKey, userKey) {
  if (link.profile !== 'linked') return;
  const records = await Recommendation.find({ ownerKey: guestKey }).select({ _id: 1 });
  for (const { _id } of records) {
    try {
      const moved = await Recommendation.updateOne(
        { _id, ownerKey: guestKey },
        { $set: { ownerType: 'user', ownerKey: userKey } }
      );
      if (moved.modifiedCount === 1) await GuestLink.updateOne({ _id: link._id }, { $addToSet: { recommendationIds: _id } });
    } catch (error) {
      if (error?.code !== 11000) throw error; // same profile version already on the account: left with the guest
    }
  }
  link.recommendationIds = (await GuestLink.findById(link._id)).recommendationIds;
}

export async function linkGuestToUser({ guestKey, userId }) {
  const link = await claim(guestKey, userId);
  if (String(link.userId) !== String(userId)) {
    throw new HttpError(409, 'guest_already_linked', 'This guest session is already linked to another account.');
  }
  if (link.status === 'completed') return summary(link);
  await afterStep('claim');

  const userKey = userOwnerKey(userId);
  await linkProfile(link, guestKey, userKey);
  await afterStep('profile');
  await linkResume(link, guestKey, userKey);
  await afterStep('resume');
  await linkRecommendations(link, guestKey, userKey);
  await afterStep('recommendations');

  link.status = 'completed';
  link.completedAt = new Date();
  await link.save();
  return summary(link);
}
