import { Resend, type CreateBatchOptions } from 'resend';
import {
  createMissingEmailProviderResult,
  reconcileEmailProviderDeliveries,
} from '@/utils/delivery-safety.mjs';
import { newsletterBatchIdempotencyKey } from '@/utils/newsletter-safety.mjs';

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

export type EmailSendOptions = {
  idempotencyKey?: string;
  replyTo?: string;
}

type BatchFailure = {
  chunk: number;
  index: number;
  to?: string;
  message: string;
}

export type EmailDeliveryResult = {
  to: string;
  status: 'sent' | 'failed';
  resendId?: string;
  error?: string;
}

export type EmailBatchOptions = {
  idempotencyKeyPrefix?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }

  return String(error);
};

const chunkEmails = (emails: EmailPayload[], size: number) => {
  const chunks: EmailPayload[][] = [];
  for (let index = 0; index < emails.length; index += size) {
    chunks.push(emails.slice(index, index + size));
  }
  return chunks;
};

// Missing provider credentials fail closed so callers cannot record mock delivery.
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  options: EmailSendOptions = {},
) => {
  if (options.replyTo && !fromEmailPattern.test(options.replyTo)) {
    const error = new Error('Email reply destination is invalid.');
    console.error(error.message);
    return { success: false, configurationError: true, error };
  }
  if (resend) {
    try {
      const result = await resend.emails.send({
        from: resendFrom,
        to,
        subject,
        html,
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      }, options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined);
      if (result.error) {
        console.error('Failed to send email via Resend:', result.error);
        return { success: false, error: result.error };
      }

      if (!result.data?.id) {
        const error = new Error('Resend did not return an acceptance identifier.');
        console.error('Failed to verify email acceptance via Resend:', error);
        return { success: false, error };
      }

      return { success: true, data: result.data, resendId: result.data.id };
    } catch (error) {
      console.error('Failed to send email via Resend:', error);
      return { success: false, error };
    }
  } else {
    const result = createMissingEmailProviderResult([{ to, subject, html }]);
    console.error(result.error.message);
    return {
      success: false,
      configurationError: true,
      error: result.error,
    };
  }
}

export const sendEmailBatch = async (
  emails: EmailPayload[],
  options: EmailBatchOptions = {},
) => {
  const validEmails = emails.filter(email => email.to && email.subject && email.html);
  const skippedCount = emails.length - validEmails.length;

  if (validEmails.length === 0) {
    return { success: true, sentCount: 0, skippedCount, failedCount: 0 };
  }

  if (resend) {
    const chunks = chunkEmails(validEmails, resendBatchLimit);
    const data = [];
    const failures: BatchFailure[] = [];
    const deliveryResults: EmailDeliveryResult[] = [];
    let sentCount = 0;

    try {
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const batchData: CreateBatchOptions = chunk.map(email => ({
          from: resendFrom,
          to: email.to,
          subject: email.subject,
          html: email.html,
        }));

        const idempotencyKey = options.idempotencyKeyPrefix
          ? newsletterBatchIdempotencyKey(options.idempotencyKeyPrefix, chunkIndex)
          : undefined;
        const result = await resend.batch.send(batchData, {
          batchValidation: 'permissive',
          idempotencyKey,
        });

        if (result.error) {
          console.error(`Failed to send email batch chunk ${chunkIndex + 1}/${chunks.length}:`, result.error);
          const message = String(result.error.message || 'Batch chunk failed');
          const unsentEmails = chunks.slice(chunkIndex).flat();
          deliveryResults.push(...unsentEmails.map((email, unsentIndex) => ({
            to: email.to,
            status: 'failed' as const,
            error: unsentIndex < chunk.length ? message : 'Not attempted because a previous batch chunk failed.',
          })));

          return {
            success: false,
            error: result.error,
            sentCount,
            failedCount: validEmails.length - sentCount,
            skippedCount,
            failures,
            deliveryResults,
          };
        }

        const providerErrors = result.data?.errors || [];
        const acceptedDeliveries = result.data?.data || [];
        const chunkResult = reconcileEmailProviderDeliveries(
          chunk,
          acceptedDeliveries,
          providerErrors,
        );

        sentCount += chunkResult.sentCount;
        data.push(...acceptedDeliveries);
        deliveryResults.push(...chunkResult.deliveryResults as EmailDeliveryResult[]);

        for (const failure of chunkResult.failures) {
          failures.push({
            chunk: chunkIndex + 1,
            index: failure.index,
            to: failure.to,
            message: failure.message,
          });
        }

        if (chunkIndex < chunks.length - 1) {
          await sleep(resendBatchPauseMs);
        }
      }

      const failedCount = failures.length;
      if (failedCount > 0) {
        console.warn(
          `Email batch completed with ${failedCount} failed recipients.`,
          failures.map(({ chunk, index, message }) => ({ chunk, index, message })),
        );
      }

      return {
        success: failedCount === 0,
        data,
        sentCount,
        failedCount,
        skippedCount,
        chunkCount: chunks.length,
        failures,
        deliveryResults,
      };
    } catch (error) {
      console.error('Failed to send email batch via Resend:', error);
      const recordedEmails = new Set(deliveryResults.map(result => result.to));
      deliveryResults.push(...validEmails
        .filter(email => !recordedEmails.has(email.to))
        .map(email => ({
          to: email.to,
          status: 'failed' as const,
          error: getErrorMessage(error),
        })));

      return {
        success: false,
        error,
        sentCount,
        failedCount: validEmails.length - sentCount,
        skippedCount,
        failures,
        deliveryResults,
      };
    }
  } else {
    const result = createMissingEmailProviderResult(validEmails);
    console.error(result.error.message);
    return { ...result, skippedCount };
  }
}
