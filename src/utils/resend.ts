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
        from: 'AeroTrade <noreply@aerotrade.app>', // Updated with verified domain
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

export const sendEmailBatch = async (emails: { to: string; subject: string; html: string }[]) => {
  if (resend) {
    try {
      // Map to Resend's batch format
      const batchData = emails.map(email => ({
        from: 'AeroTrade <noreply@aerotrade.app>',
        to: email.to,
        subject: email.subject,
        html: email.html,
      }));
      
      const data = await resend.batch.send(batchData);
      return { success: true, data };
    } catch (error) {
      console.error('Failed to send email batch via Resend:', error);
      return { success: false, error };
    }
  } else {
    // Development fallback
    console.log(`\n--- 📧 BATCH EMAIL MOCKED (${emails.length} emails) ---`);
    if (emails.length > 0) {
      console.log(`First email TO: ${emails[0].to}`);
      console.log(`SUBJECT: ${emails[0].subject}`);
      console.log(`CONTENT: ${emails[0].html.substring(0, 100)}...`);
    }
    console.log('----------------------------------------\n');
    return { success: true, mocked: true };
  }
}
