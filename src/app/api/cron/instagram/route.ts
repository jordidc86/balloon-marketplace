import { runSocialWorkflow } from '@/utils/social-workflow'
import { withSocialBudget } from '@/utils/social-request.mjs'

export async function GET(request: Request) {
  return withSocialBudget(50_000, () => runSocialWorkflow(request))
}
