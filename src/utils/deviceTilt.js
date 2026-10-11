// Phone tilt for the net-worth jar's water. The water surface stays level with
// the real world, so on screen it leans against the phone's tilt. iOS only
// sends orientation events after DeviceOrientationEvent.requestPermission(),
// which must run inside a tap; Android sends them without asking.

export const MAX_TILT_DEG = 25;

const clamp = (value, limit) => Math.min(limit, Math.max(-limit, value));
const toRad = (deg) => (deg * Math.PI) / 180;

// The angle (degrees, + = the phone's right side is lower) between the
// screen's vertical and gravity projected onto the screen. Lying flat there is
// almost no gravity in the screen plane, so the angle fades out instead of
// jumping on the slightest roll.
export const tiltFromOrientation = ({ beta, gamma }) => {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return 0;
  const gx = Math.cos(toRad(beta)) * Math.sin(toRad(gamma));
  const gy = Math.sin(toRad(beta));
  const strength = Math.hypot(gx, gy);
  if (strength < 0.05) return 0;
  const angle = (Math.atan2(gx, Math.abs(gy)) * 180) / Math.PI;
  return clamp(angle, MAX_TILT_DEG) * Math.min(1, strength / 0.5);
};

// One frame of a damped spring toward target: it overshoots a little and
// settles, which reads as water sloshing.
export const stepSpring = ({ value, velocity }, target, stiffness, damping) => {
  const nextVelocity = velocity + (target - value) * stiffness - velocity * damping;
  return { value: value + nextVelocity, velocity: nextVelocity };
};

// Asks iOS once per page load; elsewhere there is nothing to ask. Must be
// called synchronously from a tap handler.
let asked = false;
export const requestTiltPermission = () => {
  if (asked) return;
  asked = true;
  try {
    const request = window.DeviceOrientationEvent?.requestPermission;
    if (typeof request === "function") {
      request.call(window.DeviceOrientationEvent).catch(() => {});
    }
  } catch {
    // No sensor API: the water just doesn't lean.
  }
};

// Calls onTilt(deg) on every orientation event while the screen is portrait.
// Returns the unsubscribe function.
export const subscribeTilt = (onTilt) => {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    return () => {};
  }
  const handle = (event) => {
    const screenAngle = window.screen?.orientation?.angle ?? 0;
    onTilt(screenAngle === 0 ? tiltFromOrientation(event) : 0);
  };
  window.addEventListener("deviceorientation", handle);
  return () => window.removeEventListener("deviceorientation", handle);
};
