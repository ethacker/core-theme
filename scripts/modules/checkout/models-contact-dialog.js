define(["backbone", 'hyprlive', 'modules/models-customer', 'modules/models-dialog' ], function(Backbone, Hypr, CustomerModels, Dialog) {

    var modalDialog = Dialog.extend({
        relations : {
            destinationContact : CustomerModels.Contact
        },
        resetDestinationContact: function(){
        	this.set('destinationContact', new CustomerModels.Contact({address: {}}));
        },
        initialize: function () {
        	this.set('destinationContact', new CustomerModels.Contact({address: {}}));
        }
    });

    return modalDialog;
});
