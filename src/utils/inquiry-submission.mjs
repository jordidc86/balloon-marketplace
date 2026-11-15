// Keep the buyer's text on any unconfirmed result and always release the button.
export async function completeInquirySubmission({submit,setSubmitting,setResult,reset}) {
  setSubmitting(true)
  setResult(null)
  try {
    const response = await submit()
    setResult({success:response.success,message:response.message})
    if (response.success) reset()
  } catch {
    setResult({success:false,message:'We could not confirm your enquiry. Your text is still here. Please try again.'})
  } finally {
    setSubmitting(false)
  }
}
