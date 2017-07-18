define(["modules/jquery-mozu", 
    "underscore", 
    "hyprlive", 
    "modules/backbone-mozu", 
    'hyprlivecontext',
    ''], 
    function ($, _, Hypr, Backbone, HyprLiveContext) {
	DestinationSelector = {
	    initialize: function(options) {

	        this.opacityControl = options.opacityControlModel;
	        this.image = options.imageDisplayModel;

	        // this binding is what wires the 2 models together through
	        // the setOpacity method.
	        this.opacityControl.on("change", this.onOpacityChange, this);
	    },

	    onOpacityChange: function() {
	        this.image.set("opacity", this.opacityControl.get("level");)
	    }

	}
	return DestinationSelector;
}