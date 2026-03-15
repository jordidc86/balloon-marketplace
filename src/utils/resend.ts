import { Resend } from 'resend';

// Initialize Resend
// In a real production app, this would be process.env.RESEND_API_KEY
// Assuming we don't have it yet, we'll gracefully handle it allowing the app to run

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Mock email sender for development if key isn't present
export const sendEmail = async (to: string, subject: string, html: string) => {
  if (resend) {
    try {
      const data = await resend.emails.send({
        from: 'AeroTrade <noreply@aerotrade.com>', // Update with verified domain later
        to,
        subject,
        html,
      });
      return { success: true, data };
    } catch (error) {
      console.error('Failed to send email via Resend:', error);
      return { success: false, error };
    }
  } else {
    // Development fallback
    console.log('\n--- 📧 EMAIL MOCKED (No Resend Key) ---');
    console.log(`TO: ${to}`);
    console.log(`SUBJECT: ${subject}`);
    console.log(`CONTENT: ${html.substring(0, 100)}...`);
    console.log('----------------------------------------\n');
    return { success: true, mocked: true };
  }
}
