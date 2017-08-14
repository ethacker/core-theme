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
            destinationContact: CustomerModels.Contact
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
         model : ShippingDestination,
         validation: {
            ShippingDestination : "validateShippingDestination"
        },
        getCheckout : function(){
            return this.parent;
        },
        newDestination : function(contact, isCustomerAddress){
            var destination = {destinationContact : contact || new CustomerModels.Contact({})};

            if(isCustomerAddress && contact.get('id')){
               destination.customerContactId = contact.get('id');
               destination.id = contact.get('id');
            }

            destination.isCustomerContact = true;
            var shippingDestination = new ShippingDestination(destination);
            this.add(shippingDestination);
            return shippingDestination;
        },
        hasDestination: function(destinationContact){
            var self = this;
            var foundDestinations = self.filter(function(destination){
                return self.compareObjects(destination.get('destinationContact').get('address'), destinationContact.get('address'));
            });
            return (foundDestinations.length) ? true : false;
        },
        compareObjects: function(obj1, obj2) {
            var areEqual = _.isEqual(obj1, obj2);
            return areEqual;
        },
        validateShippingDestination : function(value, attr, computedState){
            var itemValidations =[];
            this.collection.each(function(item,idx){
                var validation = item.validate();
                if(validation.ShippingDestinationItem.length) itemValidations = itemValidations.concat(validation.ShippingDestinationItem);
            });
            return (itemValidations.length) ? itemValidations : null; 
        },
        addApiShippingDestination : function(destination){
            var self = this;
            return self.getCheckout().apiModel.addShippingDestination({DestinationContact : destination.get('destinationContact').toJSON()});
        },
        addShippingDestination: function(destination){
            var self = this;
            return self.addApiShippingDestination(destination).then(function(data){
                self.add(new ShippingDestination(data.data));
                return data;
            });
        },
        updateShippingDestination: function(destination){
            var self = this;
            var dest = destination.toJSON();
            dest.destinationId = dest.id;
            dest.checkoutId = this.getCheckout().get('id');

            return self.getCheckout().apiUpdateShippingDestination(dest).then(function(data){
                var entry = self.findWhere({id: data.data.id});
                if(entry) {
                    var mergedDestinationContact = _.extend(entry.get('destinationContact'),  data.data.destinationContact);
                    entry.set('destinationContact', mergedDestinationContact); 
                    self.trigger('sync');
                    self.trigger('destinationsUpdate');
                }
            });
        }
    });

   
    return {
        ShippingDestinations: ShippingDestinations,
        ShippingDestination : ShippingDestination,
        ShippingDestinationItem : ShippingDestinationItem
    };
});