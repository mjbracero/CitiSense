const listeners = new Set();
let currentAvatarUrl = null;

export function getProfileAvatarUrl() {
  return currentAvatarUrl;
}

export function setProfileAvatarUrl(url) {
  const next = url || null;

  if (currentAvatarUrl === next) {
    listeners.forEach((listener) => {
      try {
        listener(next);
      } catch (error) {
        console.log("Profile avatar listener error:", error);
      }
    });
    return;
  }

  currentAvatarUrl = next;

  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch (error) {
      console.log("Profile avatar listener error:", error);
    }
  });
}

export function subscribeProfileAvatar(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);

  // Only push an existing photo on subscribe so an empty store
  // does not wipe a cached avatar from page state.
  if (currentAvatarUrl != null) {
    try {
      listener(currentAvatarUrl);
    } catch (error) {
      console.log("Profile avatar listener error:", error);
    }
  }

  return () => {
    listeners.delete(listener);
  };
}

export function clearProfileAvatar() {
  currentAvatarUrl = null;
  listeners.forEach((listener) => {
    try {
      listener(null);
    } catch (error) {
      console.log("Profile avatar listener error:", error);
    }
  });
}
