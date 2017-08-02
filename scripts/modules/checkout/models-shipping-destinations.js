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

    var ShippingDestinationItem = Backbone.MozuModel.extend({
        //validation: CustomerModels.Contact.prototype.validation,
        dataTypes: {
            fulfillmentInfoId: function(val) {
                    return (val === 'new') ? val : Backbone.MozuModel.DataTypes.Int(val);
                },
            fulfillmentContactId: function(val) {
                    return (val === 'new') ? val : Backbone.MozuModel.DataTypes.Int(val);
                }
        },
        helpers: ['fulfillmentContacts'],
        idAttribute: "fulfillmentContactId",
        validation: {
            'fulfillmentContactId': function (value) {
                    if (!value || typeof value !== "number") return Hypr.getLabel('passwordMissing');
                }

        },
        initialize: function(){
            var self = this;

            //TODO : Remove
            //TEMP
            //Placeholder for fulfillmentContactID
            
            self.set('fulfillmentContactId', 'new');

            //Placeholder for fulfillmentInfoID
            //
            //self.set('fulfillmentInfoId', _.uniqueId());
            //
            //
            
            
        },
        
        decreaseQuanitiyByOne: function(){
            var quantity = this.get('quantity');
            if(quantity > 1) {
                this.updateDestinationQuanitiy(quantity - 1);
            }
        },
        fulfillmentContacts : function(){
           return this.collection.parent.fulfillmentContacts();
        },
        /**
         * Calls the SDK to update the checkout qunaity for that item. 
         * Returning a new checkout model containing updated quantity and price info
         */
        updateDestinationQuanitiy: function(quantity){
            var self = this;
            self.set('quantity', quantity);
            return this;
        },
        /**
         * Sets the checkout items fulfillmentInfoId and saves this via the SDK 
         * 
         */
        toggleSelectedContact :function(fulfillmentId){
            var self = this;
            var contact = _.findWhere(self.fulfillmentContacts(), {id: Number(fulfillmentId)});
            if(contact)
                contact.selected = (contact.selected) ? false : true; 
        },
        changeDestinationAddress: function(fulfillmentId){
            var self = this;
            self.toggleSelectedContact(self.get('fulfillmentContactId'));
            self.toggleSelectedContact(fulfillmentId);
            self.set({fulfillmentContactId: fulfillmentId});



            //self.addFulfillmentInfo(fulfillmentId);


            self.collection.parent.trigger('changeDestination');
        },

        /**
         * Gets the apporperate fulfillmentContact and fires the [] event to 
         * open our fulfillmentContact modal editor.
         */
        editSavedContact: function(){
            this.get('fulfillmentContactId'); 
        },
        splitOrderItem: function(){
            //if(!this.validate())
            
            if(this.get('quantity') > 1) {
                var oderItemId = this.get('id');
                var newOrderItem = this.collection.parent.getCheckout().apiModel.splitOrderItem(oderItemId);

                this.set('quantity', this.get('quantity') - 1);
                this.collection.parent.addNewDestination(newOrderItem);
            }
        },
        saveNewContact: function(){
            
        }

    });

    var ShippingDestination = Backbone.MozuModel.extend({
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

    var ShippingDestinations = Backbone.Collection.extend({
        relations: {
            model : ShippingDestination
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

            self.getCheckout().apiModel.addShippingDestination({DestinationContact : destination.get('destinationContact').toJSON()}).then(function(data){
                self.add(new ShippingDestination(data.data));
                var item = self.getCheckout().get('items').findWhere({editingDestination: true});
                item.model.isLoading(true);
                item.updateCheckoutDestination(data.data.id).then(function(){
                    item.model.set('editingDestination', false);
                    self.trigger('sync');
                    self.trigger('destinationsUpdate');
                    item.model.isLoading(false);
                })
            });
        },
        updateShippingDestination: function(destination){
            var self = this;
            var dest = destination.toJSON();
            dest['destinationId'] = dest.id;
            dest['checkoutId'] = this.getCheckout().get('id');

            self.getCheckout().apiModel.updateShippingDestination(dest).then(function(data){
                var entry = self.findWhere({id: data.data.id});
                if(entry) {
                    entry.set('destinationContact', data.data.destinationContact); 
                    self.trigger('sync');
                    self.trigger('destinationsUpdate');
                }
            });
        }
    })

   
        return {
            ShippingDestinations: ShippingDestinations,
            ShippingDestination : ShippingDestination,
            ShippingDestinationItem : ShippingDestinationItem,
        };
});