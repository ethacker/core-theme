define([
    'modules/jquery-mozu',
    'underscore',
    'hyprlive',
    'modules/backbone-mozu',
    'modules/api',
    'hyprlivecontext',
    'modules/models-customer',
    'modules/checkout/models-checkout-step',
    'modules/modal-dialog'
],
function ($, _, Hypr, Backbone, api, HyprLiveContext, CustomerModels, CheckoutStep, ModalDialog) {

    var Destination = Backbone.MozuModel.extend({
        relations: {
            DestinationContact: CustomerModels.Contact
        },
        dataTypes: {
            destinationId: function(val) {
                    return (val === 'new') ? val : Backbone.MozuModel.DataTypes.Int(val);
            }
        },
        validation: {
            'destinationId': function (value) {
                if (!value || typeof value !== "number") return Hypr.getLabel('passwordMissing');
            }

        },
        getCheckout : function(){
            return this.collection.parent.parent;
        },
    
        //validation: CustomerModels.Contact.prototype.validation,

        selectedFulfillmentAddress : function(){
            var self = this;
            return self.collection.pluck("id");
        },
        removeDestination: function(lineId, id){
            var self = this;
            self.get(lineId).get('items').remove(id);
        }
    });

    var DestinationSelector = Backbone.MozuModel.extend({
        relations: {
            items : Backbone.Collection.extend {
                model : Destination
            }
        },
         validation: {
            ShippingDestination : "validateShippingDestination"
        },
        getCheckout : function(){
            return this.parent;
        },
        addContactDestination : function(contact, isCustomerAddress){
            var destination = {destinationContact : contact}

            if(isCustomerAddress){
               destination.isCustomerAddress = isCustomerAddress
            }

            this.add(new ShippingDestination(destination));
        },
        validateShippingDestination : function(value, attr, computedState){
            var itemValidations =[];
            this.collection.each(function(item,idx){
                var validation = item.validate();
                if(validation.ShippingDestinationItem.length) itemValidations = itemValidations.concat(validation.ShippingDestinationItem);
            })
            return (itemValidations.length) ? itemValidations : null;
        },
        addShippingDestination: function(destination){
            var self = this;
            self.getCheckout().apiModel.addShippingDestination({DestinationContact : destination.get('contact').toJSON()}).then(function(data){
                self.add(new ShippingDestination(data));
                self.trigger('sync');
                self.trigger('destinationsUpdate');
            });
        },
        updateShippingDestination: function(destination){
            var self = this;
            self.getCheckout().apiUpdateShippingDestination(destination.toJSON()).then(function(data){
                var entry = self.findWhere({id: data.id});
                if(entry) {
                    self.set(entry.get('id'), data);
                    self.trigger('sync'); 
                }
            });
        }
    })

    return {
        DestinationSelector: DestinationSelector,
        Destination : Destination,
    };
});