define([
    'modules/jquery-mozu',
    'underscore',
    'hyprlive',
    'modules/backbone-mozu',
    'modules/api',  
    'hyprlivecontext',
    'modules/checkout/models-checkout-step',
    'modules/checkout/models-shipping-destinations',
    'modules/models-customer'
],
function ($, _, Hypr, Backbone, api, HyprLiveContext, CheckoutStep, ShippingDestinationModels, CustomerModels) {

    var ShippingStep = CheckoutStep.extend({
        helpers : ['orderItems', 'selectableDestinations', 'selectedDestination', 'selectedDestinationsCount'],
        validation: this.multiShipValidation,
        digitalOnlyValidation: {
            'email': {
                pattern: 'email',
                msg: Hypr.getLabel('emailMissing')
            }
        },
        singleShippingAddressValidation : { 
            singleShippingAddess : {
                fn : function(value, attr){ 
                    var destination = this.parent.get('destinations').at(0);

                    if(destination){
                        var instance = destination.get('destinationContact') instanceof CustomerModels.Contact;
                        if(!instance) {
                            destination.set('destinationContact',  new CustomerModels.Contact(destination.get('destinationContact')));
                        }
                        var destinationErrors = destination.get('destinationContact').validate();
                        return (destinationErrors) ? destinationErrors : false;
                    }
                    return true;
                }
            }
        },
        multiShipValidation : {
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
        autoUpdate: [
            'digitalContactEmail'
        ],
        initialize : function() {
            //TO-DO: This is a work around for the api sync rerendering collections.
            // Replace before using in Prod
            var self = this;
        },
        digitalGiftDestination :function() {
            //TO-DO : Primary Addresss select First
            var shippingDestinations = this.getCheckout().get('destinations');
            var dGDestination = shippingDestinations.findWhere({digitalGiftDestination: true});
            if(dGDestination){
                return dGDestination.toJSON();
            }
            return new ShippingDestinationModels.ShippingDestination({});
        },
        orderItems : function(){
            return this.parent.get("items").sortBy('originalCartItemId');
        },
        selectableDestinations : function(){
           // return this.parent.get('destinations').filter(function(destination){ return !destination.get('digitalGiftDestination') }).toJSON();
            return this.parent.get('destinations').toJSON();
        },
        selectedDestinationsCount : function(){
            var destinationCount = this.parent.get("items").countBy(function(item){ 
                return item.get('destinationId'); 
            });
            return _.size(destinationCount);
            
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
            return self.getCheckout().apiSetAllShippingDestinations({destinationId: destinationId}); 
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
        //Rename for clear
        isDigitalValid: function() {
            var email = this.get('email');
            return (!email) ? false : true;
        },
        //Rename for clear
        // Breakup into seperate api update for fulfillment
        nextDigitalOnly: function() {
            var self = this,
            checkout = this.getCheckout();

            if (self.validate()) {
                return false;
            }

            //if(digitalGiftDestination) {}

            // return self.getCheckout().apiModel.addShippingDestination({DestinationContact : {email: self.get('email')}}).then(function(data){
            //     self.isLoading(false);
            //     order.messages.reset();
            //     order.syncApiModel();

            //     self.calculateStepStatus();
            //     return order.get('billingInfo').calculateStepStatus();
            // });
        },
        nextSingleShippingAddress: function() {
            var self = this,
            checkout = this.getCheckout();
            var validationObj = self.validate();

            if (validationObj) {
                if (validationObj) {
                    Object.keys(validationObj.singleShippingAddess).forEach(function(key) {
                        this.trigger('error', {
                            message: validationObj.singleShippingAddess[key]
                        });
                    }, this);
                }
                return false;
            }

            var shippingDestination = self.getDestinations().at(0);
            self.isLoading('true');
            if(!shippingDestination.get('id')) {
                self.getDestinations().addApiShippingDestination(shippingDestination).then(function(data){
                    self.getCheckout().apiSetAllShippingDestinations({destinationId: data.data.id}).then(function(){
                        self.completeStep();
                    });
                });
            } else {
                self.getDestinations().updateShippingDestination(shippingDestination).then(function(data){
                    self.getCheckout().apiSetAllShippingDestinations({destinationId: data.data.id}).then(function(){
                        self.completeStep();
                    });
                });
            }
        },
        calculateStepStatus: function() {

                if (!this.requiresFulfillmentInfo() && this.requiresDigitalFulfillmentContact()) {
                    this.validation = this.digitalOnlyValidation;
                }

                if(this.validate()) return this.stepStatus('incomplete');

                if (!this.isMultiShipMode() && this.getCheckout().get('destinations').length < 2) {
                    this.validation = this.singleShippingAddressValidation;
                }

                if (!this.requiresFulfillmentInfo() && !this.requiresDigitalFulfillmentContact()) return this.stepStatus('complete');

                if(this.validate()) return this.stepStatus('incomplete');
                return CheckoutStep.prototype.calculateStepStatus.apply(this);
            },
        validateModel: function() {
                this.validation = this.multiShipValidation;
                var validationObj = this.validate();

                if (validationObj) {
                    if (!this.isMultiShipMode() && this.getCheckout().get('destinations').length < 2) {
                        this.validation = this.singleShippingAddressValidation;
                        this.nextSingleShippingAddress();
                        return false;
                    } 

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
            completeStep : function(){
                var self = this;
                var checkout = self.getCheckout();

                checkout.messages.reset();
                checkout.syncApiModel();
                self.isLoading(true);

                checkout.get('shippingInfo').updateShippingMethods().ensure(function() {
                    self.stepStatus('complete');
                    self.isLoading(false);
                    checkout.get('shippingInfo').calculateStepStatus();
                    checkout.get('shippingInfo').isLoading(false);
                });
            },
            // Breakup for validation
            // Break for compelete step
            next: function() {
                var self = this;
                if (!self.requiresFulfillmentInfo() && self.requiresDigitalFulfillmentContact()) {
                    return self.nextDigitalOnly();
                }

                if (!this.isMultiShipMode() && this.getCheckout().get('destinations').length < 2) {
                    return self.nextSingleShippingAddress();
                }

                if (!self.validateModel()) {  
                  return false;  
                } 

                self.completeStep();
            }
    });

    return ShippingStep;
});