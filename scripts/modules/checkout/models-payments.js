define([
    'modules/jquery-mozu',
    'underscore',
    'hyprlive',
    'modules/backbone-mozu',
    'modules/api',
    'modules/models-customer',
    'modules/models-address',
    'modules/models-paymentmethods',
    'hyprlivecontext',
    'modules/checkout/models-checkout-step',
    'modules/checkout/models-shipping-destinations'
],
    function ($, _, Hypr, Backbone, api, CustomerModels, AddressModels, PaymentMethods, HyprLiveContext, CheckoutStep, ShippingDestinations) {

    var BillingInfo = CheckoutStep.extend({
        mozuType: 'payment',
        dataTypes: {
            'isSameBillingShippingAddress': Backbone.MozuModel.DataTypes.Boolean,
            'creditAmountToApply': Backbone.MozuModel.DataTypes.Float
        },
        relations: {
            billingContact: CustomerModels.Contact,
            card: PaymentMethods.CreditCardWithCVV,
            check: PaymentMethods.Check,
            purchaseOrder: PaymentMethods.PurchaseOrder
        }
    })
    return BillingInfo;
});