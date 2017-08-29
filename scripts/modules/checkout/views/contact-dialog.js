define(['modules/backbone-mozu','hyprlive', 'modules/jquery-mozu','underscore', 'hyprlivecontext', 'modules/views-modal-dialog'], function(Backbone, Hypr, $, _, HyprLiveContext, ModalDialogView, CustomerModels) {

    var ContactModalContactView = Backbone.MozuView.extend({
        templateName : "modules/multi-ship-checkout/address-dialog",
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
                'email',
                'primaryShippingContact'
            ],
        choose: function(e) {
            var idx = parseInt($(e.currentTarget).val(), 10);
            if (idx !== -1) {
                var addr = this.model.get('address');
                var valAddr = addr.get('candidateValidatedAddresses')[idx];
                for (var k in valAddr) {
                    addr.set(k, valAddr[k]);
                }
            }
        }
    });

	var ContactModalView = ModalDialogView.extend({
	   templateName : "modules/multi-ship-checkout/modal-contact",
       handleDialogOpen : function(){
            this.setInit();
            this.model.trigger('dialogOpen');
            this.bootstrapInstance.show();
        },
		handleDialogSave : function(){

            if(this.model.get('destinationContact').validate()) return false;
            var self = this;
            var checkout = this.model.parent;

			var isAddressValidationEnabled = HyprLiveContext.locals.siteContext.generalSettings.isAddressValidationEnabled,
                    allowInvalidAddresses = HyprLiveContext.locals.siteContext.generalSettings.allowInvalidAddresses;

            var addr = this.model.get('destinationContact').get('address');

            var promptValidatedAddress = function () {
                    checkout.syncApiModel();
                    //self.isLoading(false);
                    //parent.isLoading(false);
                    //self.stepStatus('invalid');
                };

            
            if(this.model.get('destinationContact').get('primaryShippingContact')){
                checkout.get('destinations').setAsPrimaryShippingContact(this.model.get('destinationContact'), true);
            }

            var saveAddress = function(){
                if(self.model.get('id')) {
                        self.model.parent.get('destinations').updateShippingDestinationAsync(self.model).then(function(){
                            checkout.get("destinations").setAsPrimaryShippingContact(checkout.get("destinations").get(data.data.id).get('destinationContact'), true);
                        }).ensure(function () {
                             self.model.trigger('closeDialog');
                        });
                } else {
                    self.model.parent.get('destinations').saveShippingDestinationAsync(self.model).then(function(data){
                        var item = checkout.get('items').findWhere({editingDestination: true});
                        if(!item){
                            item = checkout.get('items').at(0);
                        }
                        item.isLoading(true);
                        item.updateOrderItemDestination(data.data.id).then(function(){
                            item.set('editingDestination', false);
                            self.trigger('destinationsUpdate');
                            item.isLoading(false);
                        });
                        checkout.get("destinations").setAsPrimaryShippingContact(checkout.get("destinations").get(data.data.id).get('destinationContact'), true);
                    }).ensure(function () {
                         self.model.trigger('closeDialog');    
                    });
                }
            };

			if(!this.model.validate()) {
            	if (!isAddressValidationEnabled) {
                    saveAddress();
                } else {
                    if (!addr.get('candidateValidatedAddresses')) {
                        var methodToUse = allowInvalidAddresses ? 'validateAddressLenient' : 'validateAddress';
                        addr.syncApiModel();
                        addr.apiModel[methodToUse]().then(function (resp) {
                            if (resp.data && resp.data.addressCandidates && resp.data.addressCandidates.length) {
                                if (_.find(resp.data.addressCandidates, addr.is, addr)) {
                                    addr.set('isValidated', true);
                                        saveAddress();
                                        return;
                                    }
                                addr.set('candidateValidatedAddresses', resp.data.addressCandidates);
                                self.render();
                                //promptValidatedAddress();
                            } else {
                                //completeStep();
                                saveAddress();
                            }
                        }, function (e) {
                            if (allowInvalidAddresses) {
                                // TODO: sink the exception.in a better way.
                                checkout.messages.reset();
                                saveAddress();
                            } else { 
                                checkout.messages.reset({ message: Hypr.getLabel('addressValidationError') });
                            }
                        });
                    } else {
                        saveAddress();
                    }
                }
			}
		},
        setInit : function(){
            var self = this;
            $.each(this.$el.find('[data-mz-contact-modal-content]'), function(index, val) {

                var contactModalContactView = new ContactModalContactView({
                    el: $(this),
                    model: self.model.get('destinationContact')
                });
                contactModalContactView.render();
            });  
        },

        render : function() {
            var self = this;
            self.setInit();
            //Backbone.MozuView.prototype.render.apply(this, arguments);

            // $.each(this.$el.find('[data-mz-contact-modal-content]'), function(index, val) {

            //     var contactModalContactView = new ContactModalContactView({
            //         el: $(this),
            //         model: self.model.get('contact')
            //     });
            //     contactModalContactView.render();
            // });  
        }
	});

	return ContactModalView;
});

