define(["backbone", 'hyprlive', 'modules/models-customer', 'modules/models-dialog' ], function(Backbone, Hypr, CustomerModels, Dialog) {

    var modalDialog = Dialog.extend({
        relations : {
            contact : CustomerModels.Contact
        },
        initialize: function () {
        	this.set('contact', new CustomerModels.Contact({}));
        }
    });

    return modalDialog;
});
