class SessionExpiredError extends Error {
  constructor(message='Your ChatterHigh session expired. Reconnecting…') {super(message);this.code='SESSION_EXPIRED';}
}
class SessionRecoveryError extends Error {
  constructor(message){super(message);this.code='SESSION_RECOVERY_REQUIRED';}
}
module.exports={SessionExpiredError,SessionRecoveryError};
