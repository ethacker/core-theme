define(["modules/jquery-mozu", 
    "underscore", 
    "hyprlive", 
    "modules/backbone-mozu", 
    'hyprlivecontext',
    "modules/checkout/views-checkout-step",
    'modules/editable-view',
    'modules/checkout/models-shipping-destinations'], 
    function ($, _, Hypr, Backbone, HyprLiveContext, CheckoutStepView, EditableView, ShippingDestinationModels) {

        var ShippingDestinationSingleView = Backbone.MozuView.extend({
            templateName: 'modules/common/address-form',
            autoUpdate: [
                'firstName',
                'lastNameOrSurname',
                'address.address1',
                'address.address2',
                'address.address3',
                'address.cityOrTown',
                'address.countryCode',
                'address.stateOrProvince',
                'address.postalOrZipCode',
                'address.addressType',
                'phoneNumbers.home',
                'email'
            ],
            initialize: function(){
                var self = this;
                this.listenTo(this.model, 'saveSingleDestination', function() {
                    self.saveSingleDestination();
                });
            },
            saveSingleDestination: function(){

            }
        });

        var ShippingDestinationItemView = Backbone.MozuView.extend({
            templateName: 'modules/multi-ship-checkout/shipping-destinations-item',
            additionalEvents: {
                "change [data-mz-fulfillment-contact]": "handleChangeDestinationAddress"
            },
            renderOnChange: [
                'fulfillmentInfoId',
                'fulfillmentContactId',
                'isLoading'
            ],
            initialize: function(){
                var self = this;
                this.listenTo(this.model, 'addedNewDestination', function() {
                    self.render();
                });
                this.listenTo(this.model, 'changeDestination', function() {
                    self.render();
                });
                this.listenTo(this.model, 'destinationsUpdate', function() {
                    self.render();
                });
            },
            handleChangeDestinationAddress: function(e){
                var self = this;
                var $target = $(e.currentTarget);

                if($target.val() === "new"){
                    this.handleNewContact();
                    return;
                }
                var customerContactId = $target.find(":selected").data("mzCustomercontactid");
                self.model.updateOrderItemDestination($target.val(), customerContactId);
                self.render();

            },
            handleNewContact: function(e){
                this.model.set('editingDestination', true);
                this.model.addNewContact();
                //window.checkoutViews.contactDialog.openDialog();
                var self = this;
            },
            handleEditContact: function(e){
                var destinationId = this.model.get('destinationId');
                if(destinationId) {
                    //this.model.set('editingDestination', true);
                    this.model.editContact(destinationId);    
                }
            },
            handleSplitOrderItem: function(e){
                this.model.splitCheckoutItem();
            },
            handleRemoveDestination: function(e){
                var $target = $(e.currentTarget),
                    itemId = $target.parents('[data-mz-shipping-destinations-item]').data('mzItemId');

                this.model.removeDestination();
            }
        });

        var ShippingDestinationView = Backbone.MozuView.extend({
            templateName: 'modules/multi-ship-checkout/shipping-destinations-items',
            initialize: function(){
                var self = this;
                this.listenTo(this.model, 'addedNewDestination', function() {
                    self.render();
                });
                this.listenTo(this.model, 'changeDestination', function() {
                    self.render();
                });
                this.listenTo(this.model, 'destinationsUpdate', function() {
                    self.render();
                });
            },
            render : function() {
                var self = this;
                Backbone.MozuView.prototype.render.apply(this, arguments);
                $.each(this.$el.find('[data-mz-shipping-destinations-item]'), function(index, val) {
                    var shippingDestinationItemView = new ShippingDestinationItemView({
                        el: $(this),
                        model: self.model
                    });
                    shippingDestinationItemView.render();
                });  
            }
        });

         var ComboShippingAddressView = CheckoutStepView.extend({
            templateName: 'modules/multi-ship-checkout/step-shipping-destinations',
            renderOnChange: [
                'isMultiShipMode'
            ],
            additionalEvents: {
                "change [data-mz-single-fulfillment-contact]": "handleChangeSingleAddress"
            },
            isMultiShipMode: function(){
                this.model.isMultiShipMode();
            },
            handleChangeSingleAddress: function(e){
                var self = this;
                var $target = $(e.currentTarget);

                if($target.val() === "new"){
                    this.handleNewContact();
                    return;
                }

                self.model.updateSingleCheckoutDestination($target.val()).ensure(function(){
                   //self.render(); 
                });
            },
            handleNewContact: function(e){
                this.model.set('editingDestination', true);
                this.model.addNewContact();
                //window.checkoutViews.contactDialog.openDialog();
                var self = this;
            },
            handleEditContact: function(e){
                var destinationId = this.model.get('destinationId');
                if(destinationId) {
                    //this.model.set('editingDestination', true);
                    this.model.editContact(destinationId);    
                }
            },
            initialize: function(){
                var self = this;
                this.listenTo(this.model.parent, 'sync', function() {
                    self.render();
                });
                this.listenTo(this.model.getDestinations(), 'destinationsUpdate', function() {
                    self.render();
                });
            },
            render: function(){
                var self = this;
                this.$el.removeClass('is-new is-incomplete is-complete is-invalid').addClass('is-' + this.model.stepStatus());
                EditableView.prototype.render.apply(this, arguments);
                this.resize();

                $.each(this.$el.find('[data-mz-shipping-destinations-item]'), function(index, val) {
                    var id = $(this).data('mzItemId');
                    var shippingDestination = self.model.parent.get("items").findWhere({'id': id});
                    var shippingDestinationView = new ShippingDestinationItemView({
                        el: $(this),
                        model: shippingDestination
                    });
                    shippingDestinationView.render();
                });

                $.each(this.$el.find('[data-mz-shipping-destination-single]'), function(index, val) {
                    var shippingDestination = self.model.getCheckout().get('destinations').at(0);
                    if(!shippingDestination) {
                        shippingDestination = self.model.getCheckout().get('destinations').newDestination();
                    }
                    var shippingDestinationSingleView = new ShippingDestinationSingleView({
                        el: $(this),
                        model: shippingDestination.get('destinationContact')
                    });
                    shippingDestinationSingleView.render();
                });
            }
        });

        

        // if(this.model.isMultiShipMode){
        //     return MultiShippingAddressView;
        // }
        // 
        var determineView = function(options){
            if(options.model) {
                if(options.model.isMultiShipMode()){
                    return new ComboShippingAddressView(options);
                } else {
                    return new ComboShippingAddressView(options);
                }
            }
        };
        return determineView;
});