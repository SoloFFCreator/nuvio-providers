import { StreamApiError } from "./errors.js";
import { ALLOWED_ANDROID_PACKAGES, type AllowedAndroidPackage } from "./types.js";

export function validateAllowedPackage(packageName?: string): AllowedAndroidPackage {
  if (!packageName || !ALLOWED_ANDROID_PACKAGES.includes(packageName as AllowedAndroidPackage)) {
    throw new StreamApiError(
      403,
      "package_not_allowed",
      "The requesting Android package is not allowed to use this API."
    );
  }

  return packageName as AllowedAndroidPackage;
}
