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

// The tilt is opt-in from 設定 and remembered on this device. iOS forgets the
// sensor permission whenever the app is closed, so with it on we ask again on
// the first jar tap of each launch; with it off we never ask.
const TILT_ENABLED_KEY = "my-stock:tilt-enabled";

const readEnabled = () => {
  try {
    return window.localStorage.getItem(TILT_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
};

let enabled = typeof window !== "undefined" && readEnabled();
// Whether iOS has granted the sensor in this launch.
let granted = false;

export const isTiltEnabled = () => enabled;

const permissionRequest = () => {
  const request = window.DeviceOrientationEvent?.requestPermission;
  return typeof request === "function"
    ? () => request.call(window.DeviceOrientationEvent)
    : null;
};

export const setTiltEnabled = (on) => {
  enabled = on;
  try {
    window.localStorage.setItem(TILT_ENABLED_KEY, on ? "1" : "0");
  } catch {
    // Not remembered: it is just off again next launch.
  }
};

// Turns the tilt on from the switch's tap, asking iOS right away. Resolves to
// whether it ended up on (a refusal turns the switch back off).
export const enableTiltFromTap = () => {
  setTiltEnabled(true);
  const request = permissionRequest();
  if (!request) return Promise.resolve(true);
  return request()
    .catch(() => "denied")
    .then((state) => {
      granted = state === "granted";
      if (!granted) setTiltEnabled(false);
      return granted;
    });
};

// On launch with the tilt on: if iOS still holds the permission (a reload
// while the app stayed open) it answers without asking; otherwise it needs a
// tap and rejects quietly, and the jar tap asks.
export const checkTiltPermission = () => {
  const request = permissionRequest();
  if (!enabled || !request) return;
  request()
    .then((state) => {
      granted = state === "granted";
    })
    .catch(() => {});
};

// Asks iOS from a jar tap, once per launch, only with the tilt on. Must be
// called synchronously from the tap handler.
let asked = false;
export const requestTiltPermission = () => {
  const request = permissionRequest();
  if (!enabled || granted || asked || !request) return;
  asked = true;
  request()
    .then((state) => {
      granted = state === "granted";
    })
    .catch(() => {});
};

// Calls onTilt(deg) on every orientation event while the tilt is on and the
// screen is portrait.
// Returns the unsubscribe function.
export const subscribeTilt = (onTilt) => {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    return () => {};
  }
  const handle = (event) => {
    const screenAngle = window.screen?.orientation?.angle ?? 0;
    onTilt(enabled && screenAngle === 0 ? tiltFromOrientation(event) : 0);
  };
  window.addEventListener("deviceorientation", handle);
  return () => window.removeEventListener("deviceorientation", handle);
};
