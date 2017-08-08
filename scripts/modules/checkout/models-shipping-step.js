define([
    'modules/jquery-mozu',
    'underscore',
    'hyprlive',
    'modules/backbone-mozu',
    'modules/api',
    'hyprlivecontext',
    'modules/checkout/models-checkout-step'
],
function ($, _, Hypr, Backbone, api, HyprLiveContext, CheckoutStep) {

    var ShippingStep = CheckoutStep.extend({
        helpers : ['orderItems', 'selectableDestinations', 'selectedDestination'],
        validation: {
            ShippingDestinations :{
            fn: function(value, attr){
                var destinationErrors = [];
                this.parent.get('items').forEach(function(item, idx){
                    var itemValid = item.validate();
                    if (itemValid && item.get('fulfillmentMethod') === "Ship") {
                        destinationErrors.push(itemValid);
                    }
                });
                return (destinationErrors.length) ? destinationErrors : false;
            }
            }
        },
        initSet : function(){
           var self = this;
            // var orderItems = self.parent.get('items');
            // var groupedOrderItems = _.groupBy(orderItems, 'lineId');
            // _.each(groupedOrderItems, function(value, key){
            //     self.getDestinations().add(new ShippingDestination({ lineId: key, items: value }));
            // }); 
            
            
        },
        initialize : function() {
            //TO-DO: This is a work around for the api sync rerendering collections.
            // Replace before using in Prod
            var self = this;
            //api.on('sync', function(asdf,asdff, asdfff){
                //self.parent.set('items', asdff.items);
                //self.trigger('render');
            //});
        },
        orderItems : function(){
             return this.parent.get("items").models;
        },
        selectableDestinations : function(){
            return this.parent.get('destinations').toJSON();
        },
        selectedDestination : function(){
            var selectedId = this.getCheckout().get('items').at(0).get('destinationId');
            if(selectedId){
                return this.getCheckout().get('destinations').get(selectedId).toJSON();
            }
        },
        getCheckout: function(){
            return this.parent;
        },
        updateSingleCheckoutDestination: function(destinationId){
            var self = this;
            return this.getCheckout().apiSetAllShippingDestinations({destinationId: destinationId});
        },
        addNewContact: function(){
            this.getCheckout().get('dialogContact').get("destinationContact").clear();
            this.getCheckout().get('dialogContact').unset('id');

            this.getCheckout().get('dialogContact').trigger('openDialog');
        },
        getDestinations : function() {
            return this.parent.get("destinations");
        },
        toJSON: function() {
                if (this.requiresFulfillmentInfo() || this.requiresDigitalFulfillmentContact()) {
                    return CheckoutStep.prototype.toJSON.apply(this, arguments);
                }
            },
            //Rename for clear
        isDigitalValid: function() {
                var email = this.get('email');
                return (!email) ? false : true;
            },
        calculateStepStatus: function() {
                if (!this.requiresFulfillmentInfo() && this.requiresDigitalFulfillmentContact()) {
                    this.validation = this.digitalOnlyValidation;
                }

                if (!this.requiresFulfillmentInfo() && !this.requiresDigitalFulfillmentContact()) return this.stepStatus('complete');

                if(this.validate()) return this.stepStatus('incomplete');
                return CheckoutStep.prototype.calculateStepStatus.apply(this);
            },
        validateModel: function() {
                var validationObj = this.validate();

                if (validationObj) {
                    Object.keys(validationObj.ShippingDestinations).forEach(function(key) {
                        Object.keys(validationObj.ShippingDestinations[key]).forEach(function(keyLevel2) {
                            this.trigger('error', {
                                message: validationObj.ShippingDestinations[key][keyLevel2]
                            });
                        }, this);
                    }, this);

                    return false;
                }
                return true;
            },
        validateAddresses: function() {
                var self = this,
                    order = this.getOrder(),
                    addr = this.get('address'),
                    deferredValidate = api.defer(),
                    isAddressValidationEnabled = HyprLiveContext.locals.siteContext.generalSettings.isAddressValidationEnabled,
                    allowInvalidAddresses = HyprLiveContext.locals.siteContext.generalSettings.allowInvalidAddresses;

                var promptValidatedAddress = function() {
                    order.syncApiModel();
                    self.isLoading(false);
                    // Redundent
                    //parent.isLoading(false);
                    self.stepStatus('invalid');
                };

                if (!isAddressValidationEnabled) {
                    deferredValidate.resolve();
                } else {
                    if (!addr.get('candidateValidatedAddresses')) {
                        var methodToUse = allowInvalidAddresses ? 'validateAddressLenient' : 'validateAddress';
                        addr.syncApiModel();
                        addr.apiModel[methodToUse]().then(function(resp) {
                            if (resp.data && resp.data.addressCandidates && resp.data.addressCandidates.length) {
                                if (_.find(resp.data.addressCandidates, addr.is, addr)) {
                                    addr.set('isValidated', true);
                                    deferredValidate.resolve();
                                    return;
                                }
                                addr.set('candidateValidatedAddresses', resp.data.addressCandidates);
                                promptValidatedAddress();
                            } else {
                                deferredValidate.resolve();
                            }
                        }, function(e) {
                            if (allowInvalidAddresses) {
                                // TODO: sink the exception.in a better way.
                                order.messages.reset();
                                deferredValidate.reject();
                            } else {
                                order.messages.reset({
                                    message: Hypr.getLabel('addressValidationError')
                                });
                            }
                        });
                    } else {
                        deferredValidate.reject();
                    }
                }
                return deferredValidate.promise;
            },
            // Breakup for validation
            // Break for compelete step
            next: function() {
                var self = this;
                if (!self.requiresFulfillmentInfo() && self.requiresDigitalFulfillmentContact()) {
                    return self.nextDigitalOnly();
                }


                if (!self.validateModel()) return false;

                var order = self.getOrder(),
                    fulfillmentInfo = order.get('shippingInfo');
                    

                self.isLoading(true);

                var completeStep = function() {
                    order.messages.reset();
                    order.syncApiModel();

                    fulfillmentInfo.updateShippingMethods().ensure(function() {
                        self.stepStatus('complete');
                        self.isLoading(false);
                        fulfillmentInfo.calculateStepStatus();
                    });

                    // order.apiModel.updateCheckout(order.toJSON()).then(function () {
                         
                    // });

                    //
                    // Remove getShippingMethodsFromContact, move to shipping Fulfillment as call to refresh
                    // Saves Fulfillment Info and Returns Shipping Methods 
                    //
                    // order.apiModel.getShippingMethodsFromContact().then(function (methods) {
                    //     return parent.refreshShippingMethods(methods);
                    // }).ensure(function () {
                    //     addr.set('candidateValidatedAddresses', null);
                    //     self.isLoading(false);
                    //     //Redundent
                    //     //parent.isLoading(false);
                    //     self.calculateStepStatus();
                    //     //Redundent
                    //     //parent.calculateStepStatus();
                    // });                  
                };
                completeStep();

            }
    });

    return ShippingStep;
});