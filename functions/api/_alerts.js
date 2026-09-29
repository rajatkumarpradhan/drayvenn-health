/* Login alerts: one hook, every configured channel. Each channel no-ops cleanly
   when its provider is not configured; alert failures never block a login. */
import { sendLoginAlert } from './_sms.js';
import { sendLoginAlertEmail } from './_email.js';

export async function notifyLogin(env, patient, method, request) {
  const results = [];
  const emailTo = patient.email || patient.google_email;
  if (emailTo) results.push(await sendLoginAlertEmail(env, emailTo, method));
  if (patient.phone) results.push(await sendLoginAlert(env, patient, method, request));
  return results;
}
