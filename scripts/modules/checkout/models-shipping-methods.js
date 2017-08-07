define([
    'modules/jquery-mozu',
    'underscore',
    'hyprlive',
    'modules/backbone-mozu',
    'modules/api',
    'hyprlivecontext',
    'modules/checkout/models-checkout-step',
    'modules/checkout/model-fulfillment-contact'
],
function ($, _, Hypr, Backbone, api, HyprLiveContext, CheckoutStep, FulfillmentContact) {

 var FulfillmentInfoItem = Backbone.MozuModel.extend({
        relations: {
            fulfillmentContact: FulfillmentContact
        },
        validation: {
            shippingMethodCode: {
                required: true,
                msg: Hypr.getLabel('chooseShippingMethod')
            }
        },
        getOrder: function() {
                return this.collection.parent.parent;
            },
        compareShippingMethods: function(newMethods){
            var self = this;
            return _.isMatch(self.get('availableShippingMethods'), newMethods);
        },
        getShippingMethodsFromContact: function(){
                var self = this;
                self.isLoading(true);
                self.getOrder().apiModel.getShippingMethodsFromContact().then(function (methods) {
                    if(!self.compareShippingMethods(methods)) {
                        self.refreshShippingMethods(methods);
                        self.chooseDefaultShippingMethod();
                    }
                }).ensure(function () {
                    //addr.set('candidateValidatedAddresses', null);
                    self.isLoading(false);
                    //Redundent
                    //parent.isLoading(false);
                    self.calculateStepStatus();
                    //Redundent
                    //parent.calculateStepStatus();
                });  
            },
            refreshShippingMethods: function (methods) {
                this.set({
                    availableShippingMethods: methods
                });

                //Side Affect, Refresh should refresh nothing more
                // //always make them choose again
                //_.each(['shippingMethodCode', 'shippingMethodName'], this.unset, this);
                
                //Side Affect, Refresh should refresh nothing more
                // //after unset we need to select the cheapest option
                //this.updateShippingMethod();
            },
            chooseDefaultShippingMethod : function(){
                _.each(['shippingMethodCode', 'shippingMethodName'], this.unset, this);
                //after unset we need to select the cheapest option
                this.updateShippingMethod();
            },
            
            updateShippingMethod: function (code, resetMessage) {
                var available = this.get('availableShippingMethods'),
                    newMethod = _.findWhere(available, { shippingMethodCode: code }),
                    lowestValue = _.min(available, function(ob) { return ob.price; }); // Returns Infinity if no items in collection.

                if (!newMethod && available && available.length && lowestValue) {
                    newMethod = lowestValue;
                }
                if (newMethod) {
                    this.set(newMethod);
                    this.applyShipping(resetMessage);
                }
            },
            applyShipping: function(resetMessage) {
                if (this.validate()) return false;
                var me = this;
                this.isLoading(true);
                var order = this.getOrder();
                if (order) {
                    order.apiModel.update({ fulfillmentInfo: me.toJSON() })
                        .then(function (o) {
                            var billingInfo = me.parent.get('billingInfo');
                            if (billingInfo) {
                                billingInfo.loadCustomerDigitalCredits();
                                // This should happen only when order doesn't have payments..
                                billingInfo.updatePurchaseOrderAmount();
                            }
                        })
                        .ensure(function() {
                            me.isLoading(false);
                            me.calculateStepStatus();
                            me.parent.get('billingInfo').calculateStepStatus();
                            if(resetMessage) {
                                me.parent.messages.reset(me.parent.get('messages'));
                            }
                        });
                }
            }
    });
    
    
    
    var FulfillmentInfo = CheckoutStep.extend({ 
            helpers : ['groupings'],
            validation: {
                ShippingMethods :{
                    fn: function(value, attr){
                        var shippingErrors = [];
                        this.parent.get('groupings').forEach(function(item, idx){
                            var itemValid = item.validate();
                            if (itemValid) {
                                shippingErrors.push(itemValid);
                            }
                        });
                        return (shippingErrors.length) ? shippingErrors : false;
                    }
                }
            },
            getCheckout: function() {
                return this.parent;
            },
            groupings : function(){
                var groups = [];
                this.getCheckout().get('groupings').each(function(group){ 
                    groups.push(group.toJSON({ helpers: true }));
                });
                return groups;
            },
            // updateGroupingShippingMethod: function(e) {
            //     var self = this;
            //     var groupingId = $(e.currentTarget).attr('data-mz-grouping-id');
            //     var grouping = self.getCheckout().get('groupings').findWhere({id: groupingId});

            //     grouping.set('shippingMethodCode', $(e.currentTarget).val());
            //     self.getCheckout().syncApiModel();
            //     self.getCheckout().apiModel.updateCheckoutItemFulfillment().then(function(){

            //     })
            // },
            refreshShippingMethods: function (methods) {
                this.parent.get('shippingMethods').add(methods);
            },
            updateShippingMethods : function(){
                var self = this;
                this.getCheckout().apiGetAvaiableShippingMethods().then(function (methods) {
                    self.refreshShippingMethods(methods);      
                    self.calculateStepStatus();
                });
            },
            validateModel: function() {
                var validationObj = this.validate();

                if (validationObj) {
                    Object.keys(validationObj.ShippingMethods).forEach(function(key) {
                        Object.keys(validationObj.ShippingMethods[key]).forEach(function(keyLevel2) {
                            this.trigger('error', {
                                message: validationObj.ShippingMethods[key][keyLevel2]
                            });
                        }, this);
                    }, this);

                    return false;
                }
                return true;
            },
            calculateStepStatus: function () {
                // If no shipping required, we're done.
                if (!this.requiresFulfillmentInfo()) return this.stepStatus('complete');

                // If there's no shipping address yet, go blank.
                if (this.parent.get('shippingStep').stepStatus() !== 'complete') {
                    return this.stepStatus('new'); 
                }

                if(this.validate()) {
                   return this.stepStatus('incomplete'); 
                }

                // Incomplete status for shipping is basically only used to show the Shipping Method's Next button,
                // which does nothing but show the Payment Info step.
                // var billingInfo = this.parent.get('billingInfo');
                // if (!billingInfo || billingInfo.stepStatus() === 'new') return this.stepStatus('incomplete');

                // Payment Info step has been initialized. Complete status hides the Shipping Method's Next button.
                return this.stepStatus('complete');
            },
            shippingInfoUpdated: function(){
                this.trigger('shippingInfoUpdated');
            },
            next: function () {
                if(!this.validateModel()) {
                   return false; 
                }

                this.stepStatus('complete');
                this.parent.get('billingInfo').calculateStepStatus();
            }
        });
    return FulfillmentInfo;
});