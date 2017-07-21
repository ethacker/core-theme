define(['modules/jquery-mozu','underscore', 'hyprlivecontext', 'modules/views-modal-dialog'], function($, _, HyprLiveContext, ModalDialogView) {

    var ContactModalContactView = Backbone.MozuView.extend({
        templateName : "modules/common/address-form",
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
            ]
    })

	var ContactModalView = ModalDialogView.extend({
	   templateName : "modules/multi-ship-checkout/modal-contact",
       handleDialogOpen : function(){
            this.setInit();
            this.model.trigger('dialogOpen');
            this.bootstrapInstance.show();
        },
		handleDialogSave : function(){

            if(this.model.get('contact').validate()) return false

			var isAddressValidationEnabled = HyprLiveContext.locals.siteContext.generalSettings.isAddressValidationEnabled,
                    allowInvalidAddresses = HyprLiveContext.locals.siteContext.generalSettings.allowInvalidAddresses;

			if(!this.model.validate()) {
            	if (!isAddressValidationEnabled) {
                    this.model.trigger('closeDialog');
                } else {
                    if (!addr.get('candidateValidatedAddresses')) {
                        var methodToUse = allowInvalidAddresses ? 'validateAddressLenient' : 'validateAddress';
                        addr.syncApiModel();
                        addr.apiModel[methodToUse]().then(function (resp) {
                            if (resp.data && resp.data.addressCandidates && resp.data.addressCandidates.length) {
                                if (_.find(resp.data.addressCandidates, addr.is, addr)) {
                                    addr.set('isValidated', true);
                                        completeStep();
                                        return;
                                    }
                                addr.set('candidateValidatedAddresses', resp.data.addressCandidates);
                                promptValidatedAddress();
                            } else {
                                completeStep();
                            }
                        }, function (e) {
                            if (allowInvalidAddresses) {
                                // TODO: sink the exception.in a better way.
                                order.messages.reset();
                                completeStep();
                            } else {
                                order.messages.reset({ message: Hypr.getLabel('addressValidationError') });
                            }
                        });
                    } else {
                        completeStep();
                    }
                }
                this.model.parent.get('destinations').addShippingDestination(this.model);
			}
		},
        setInit : function(){
            var self = this;
            $.each(this.$el.find('[data-mz-contact-modal-content]'), function(index, val) {

                var contactModalContactView = new ContactModalContactView({
                    el: $(this),
                    model: self.model.get('contact')
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

