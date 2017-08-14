define([
    'modules/jquery-mozu',
    'underscore',
    'hyprlive',
    'modules/backbone-mozu',
    'modules/api',
    'modules/models-customer',
    'modules/models-address',
    'modules/models-paymentmethods',
    'modules/models-orders',
    'hyprlivecontext',
    'modules/checkout/models-shipping-destinations'
],
    function ($, _, Hypr, Backbone, api, CustomerModels, AddressModels, PaymentMethods, OrderModels, 
        HyprLiveContext, ShippingDestinationModels) {

        var CheckoutPage = Backbone.MozuModel.extend({
            relations: {
                destinations : ShippingDestinationModels.ShippingDestinations,
                customer: CustomerModels.Customer
            }
        });

        var CheckoutPageView = Backbone.MozuView.extend({
            templateName: 'modules/collectionTest'
        });


        $(document).ready(function () {
            var checkoutData = require.mozuData('checkout');
            var model = new CheckoutPage(checkoutData);
            window.model = model;
            var checkoutPageView = new CheckoutPageView({
                    el: $('#page-wrapper'),
                    model: model
                });
            checkoutPageView.render();
        });
});