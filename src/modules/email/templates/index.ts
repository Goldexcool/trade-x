import { orderPaid, type OrderPaidData } from './order-paid.ts'
import { paymentFailed, type PaymentFailedData } from './payment-failed.ts'
import { signupCode, type SignupCodeData } from './signup-code.ts'
import { welcome, type WelcomeData } from './welcome.ts'

const templates = {
  signup_code: signupCode,
  welcome,
  order_paid: orderPaid,
  payment_failed: paymentFailed,
}

type DataMap = { signup_code: SignupCodeData; welcome: WelcomeData; order_paid: OrderPaidData; payment_failed: PaymentFailedData }
export type TemplateName = keyof typeof templates
export type TemplateData<T extends TemplateName> = DataMap[T]

export function render<T extends TemplateName>(name: T, data: TemplateData<T>): { subject: string; html: string; text: string } {
  return (templates[name] as (d: TemplateData<T>) => { subject: string; html: string; text: string })(data)
}
