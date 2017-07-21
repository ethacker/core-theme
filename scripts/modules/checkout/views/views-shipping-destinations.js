define(["modules/jquery-mozu", 
    "underscore", 
    "hyprlive", 
    "modules/backbone-mozu", 
    'hyprlivecontext',
    "modules/checkout/views-checkout-step",
    'modules/editable-view'], 
    function ($, _, Hypr, Backbone, HyprLiveContext, CheckoutStepView, EditableView) {
        var SingleShippingAddressView = CheckoutStepView.extend({
            templateName: 'modules/checkout/step-shipping-destinations',
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
                'contactId',
                'email'
            ],
            renderOnChange: [
                'address.countryCode',
                'contactId'
            ],
            beginAddContact: function () {
                this.model.set('contactId', 'new');
            },
            setMultiShipMode : function(){
                if(self.model.get('items').length > 1) {
                    this.model.setMultiShipMode(true);
                }
            }
        });

        var ShippingDestinationItemView = Backbone.MozuView.extend({
            templateName: 'modules/multi-ship-checkout/shipping-destinations-item',
            additionalEvents: {
                    "change [data-mz-fulfillment-contact]": "handleChangeDestinationAddress"
            },
            renderOnChange: [
                'fulfillmentInfoId',
                'fulfillmentContactId'
            ],
            handleChangeDestinationAddress: function(e){
                var self = this;
                var $target = $(e.currentTarget);

                if($target.val() === "new"){
                    this.handleNewContact();
                    return;
                }

                self.model.updateCheckoutDestination($target.val());
                self.render();

            },
            handleNewContact: function(e){
                this.model.addNewContact();
                //window.checkoutViews.contactDialog.openDialog();
                var self = this;
            },
            handleEditContact: function(e){
                var self = this;
            },
            handleSplitOrderItem: function(e){
                this.model.splitCheckoutItem();
            },
            handleRemoveDestination: function(e){
                var $target = $(e.currentTarget),
                    itemId = $target.parents('[data-mz-shipping-destinations-item]').data('mzItemId');

                this.model.removeDestination();
            },
            initialize: function(){
                var self = this;

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

        var MultiShippingAddressView = CheckoutStepView.extend({
            templateName: 'modules/multi-ship-checkout/step-shipping-destinations',
            setMultiShipMode : function(){
                this.model.setMultiShipMode(false);
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

                $.each(this.$el.find('[data-mz-shipping-destinations-items]'), function(index, val) {
                    var id = $(this).data('mzId');
                    var shippingDestination = self.model.parent.get("items").findWhere({'id': id});
                    var shippingDestinationView = new ShippingDestinationView({
                        el: $(this),
                        model: shippingDestination
                    });
                    shippingDestinationView.render();
                });
            }
        });

        // if(this.model.isMultiShipMode){
        //     return MultiShippingAddressView;
        // }
        return MultiShippingAddressView;
});