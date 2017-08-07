define(["modules/jquery-mozu", 
    "underscore", 
    "hyprlive", 
    "modules/backbone-mozu", 
    'hyprlivecontext',
    "modules/checkout/views-checkout-step",
    'modules/editable-view'], 
    function ($, _, Hypr, Backbone, HyprLiveContext, CheckoutStepView, EditableView) {
        var SingleShippingInfoView = CheckoutStepView.extend({
            templateName: 'modules/multi-ship-checkout/shipping-methods',
            renderOnChange: [
                'availableShippingMethods'
            ],
            additionalEvents: {
                "change [data-mz-shipping-method]": "updateShippingMethod"
            },
            updateShippingMethod: function (e) {
                this.model.updateShippingMethod(this.$('[data-mz-shipping-method]:checked').val());
            }
        });

        var MultiShippingInfoView = CheckoutStepView.extend({
            templateName: 'modules/multi-ship-checkout/step-shipping-methods',
            renderOnChange: [
                'availableShippingMethods'
            ],
            additionalEvents: {
                "change [data-mz-shipping-method]": "updateGroupingShippingMethod"
            },
             initialize: function(){
                var self = this;
                this.listenTo(this.model, 'shippingInfoUpdated', function() {
                    self.render();
                });
            },
            initStepView: function(){
                CheckoutStepView.prototype.initStepView.apply(this, arguments);
                this.model.updateShippingMethods();
            },
            updateShippingMethod: function (e) {
                this.model.updateShippingMethod(this.$('[data-mz-shipping-method]:checked').val());
            },
            updateGroupingShippingMethod: function(e) {
                var self = this;
                var groupingId = $(e.currentTarget).attr('data-mz-grouping-id');
                var grouping = self.model.getCheckout().get('groupings').findWhere({id: groupingId});
                var shippingRates = self.model.getCheckout().get('shippingMethods').findWhere({groupingId: groupingId}).get('shippingRates');

                var shippingRate = _.findWhere(shippingRates, {shippingMethodCode: $(e.currentTarget).val()});
                grouping.set('shippingRate', shippingRate);
                grouping.set('shippingMethodCode', shippingRate.shippingMethodCode);
                self.model.getCheckout().syncApiModel();

                if(!$(e.currentTarget).selected) {
                    self.model.getCheckout().apiSetShippingMethod({groupId: groupingId, shippingRate: shippingRate}).then(function(){

                    });
                    // self.model.getCheckout().apiSetShippingMethods().then(function(){

                    // });
                }
            },
            render: function(){
                var self = this;
                this.$el.removeClass('is-new is-incomplete is-complete is-invalid').addClass('is-' + this.model.stepStatus());
                //this.model.initSet();
                // var hasDestinations = self.model.getCheckout().get('items').filter(function(item){
                //     return item.get('destinationId');
                // });
                // if(self.model.getCheckout().get('groupings').length && !self.model.getCheckout().get('shippingMethods').length && hasDestinations.length == self.model.getCheckout().get('items').length) {
                //     self.model.getCheckout().apiModel.getAvaiableShippingMethods().then(function (methods) {
                //         self.model.refreshShippingMethods(methods);
                //         self.model.shippingInfoUpdated();
                //         //self.calculateStepStatus();
                //         //self.isLoading(false);
                //     });   
                // }

                EditableView.prototype.render.apply(this, arguments);
                this.resize();
            }
        });

        return MultiShippingInfoView;
});