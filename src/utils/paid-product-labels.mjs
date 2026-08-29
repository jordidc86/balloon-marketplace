export const buyerEarlyAccessProduct = Object.freeze({
  internalType: 'premium_subscription',
  publicName: 'AeroTrade Buyer Early Access',
  paymentLabelEs: 'acceso anticipado anual para compradores',
})

export const sellerLaunchPromotionProduct = Object.freeze({
  internalType: 'listing_fee',
  publicName: 'AeroTrade Seller Launch Promotion',
  paymentLabelEs: 'promoción de lanzamiento del anuncio',
})

export const paidProductByPaymentType = Object.freeze({
  [buyerEarlyAccessProduct.internalType]: buyerEarlyAccessProduct,
  [sellerLaunchPromotionProduct.internalType]: sellerLaunchPromotionProduct,
})
