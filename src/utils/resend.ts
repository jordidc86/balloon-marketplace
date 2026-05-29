import { Resend, type CreateBatchOptions } from 'resend';

// Initialize Resend
// In a real production app, this would be process.env.RESEND_API_KEY
// Assuming we don't have it yet, we'll gracefully handle it allowing the app to run

const resendApiKey = process.env.RESEND_API_KEY;
const defaultResendFrom = 'AeroTrade <noreply@aerotrade.app>';
const fromEmailPattern = /^([^<>]+<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/;
const resendFrom = process.env.RESEND_FROM && fromEmailPattern.test(process.env.RESEND_FROM)
  ? process.env.RESEND_FROM
  : defaultResendFrom;
const resendBatchLimit = 100;
const resendBatchPauseMs = 250;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
}

type BatchFailure = {
  chunk: number;
  index: number;
  to?: string | string[];
  message: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const chunkEmails = (emails: EmailPayload[], size: number) => {
  const chunks: EmailPayload[][] = [];
  for (let index = 0; index < emails.length; index += size) {
    chunks.push(emails.slice(index, index + size));
  }
  return chunks;
};

// Mock email sender for development if key isn't present
export const sendEmail = async (to: string, subject: string, html: string) => {
  if (resend) {
    try {
      const result = await resend.emails.send({
        from: resendFrom,
        to,
        subject,
        html,
      });
      if (result.error) {
        console.error('Failed to send email via Resend:', result.error);
        return { success: false, error: result.error };
      }

      return { success: true, data: result.data };
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

export const sendEmailBatch = async (emails: EmailPayload[]) => {
  const validEmails = emails.filter(email => email.to && email.subject && email.html);
  const skippedCount = emails.length - validEmails.length;

  if (validEmails.length === 0) {
    return { success: true, sentCount: 0, skippedCount, failedCount: 0 };
  }

  if (resend) {
    const chunks = chunkEmails(validEmails, resendBatchLimit);
    const data = [];
    const failures: BatchFailure[] = [];
    let sentCount = 0;

    try {
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const batchData: CreateBatchOptions = chunk.map(email => ({
          from: resendFrom,
          to: email.to,
          subject: email.subject,
          html: email.html,
        }));

        const result = await resend.batch.send(batchData, { batchValidation: 'permissive' });

        if (result.error) {
          console.error(`Failed to send email batch chunk ${chunkIndex + 1}/${chunks.length}:`, result.error);
          return {
            success: false,
            error: result.error,
            sentCount,
            failedCount: validEmails.length - sentCount,
            skippedCount,
            failures,
          };
        }

        const sentInChunk = result.data?.data?.length || 0;
        sentCount += sentInChunk;
        data.push(...(result.data?.data || []));

        for (const error of result.data?.errors || []) {
          const failedEmail = chunk[error.index];
          failures.push({
            chunk: chunkIndex + 1,
            index: error.index,
            to: failedEmail?.to,
            message: error.message,
          });
        }

        if (chunkIndex < chunks.length - 1) {
          await sleep(resendBatchPauseMs);
        }
      }

      const failedCount = failures.length;
      if (failedCount > 0) {
        console.warn(`Email batch completed with ${failedCount} failed recipients:`, failures);
      }

      return {
        success: sentCount > 0 || failedCount === 0,
        data,
        sentCount,
        failedCount,
        skippedCount,
        chunkCount: chunks.length,
        failures,
      };
    } catch (error) {
      console.error('Failed to send email batch via Resend:', error);
      return {
        success: false,
        error,
        sentCount,
        failedCount: validEmails.length - sentCount,
        skippedCount,
        failures,
      };
    }
  } else {
    // Development fallback
    console.log(`\n--- EMAIL BATCH MOCKED (${validEmails.length} emails) ---`);
    if (validEmails.length > 0) {
      console.log(`First email TO: ${validEmails[0].to}`);
      console.log(`SUBJECT: ${validEmails[0].subject}`);
      console.log(`CONTENT: ${validEmails[0].html.substring(0, 100)}...`);
    }
    console.log('----------------------------------------\n');
    return {
      success: true,
      mocked: true,
      sentCount: validEmails.length,
      skippedCount,
      failedCount: 0,
      chunkCount: Math.ceil(validEmails.length / resendBatchLimit),
    };
  }
}
