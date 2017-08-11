define([
    'modules/jquery-mozu',
    'underscore',
    'hyprlive',
    'modules/backbone-mozu',
    'modules/api',
    'modules/models-customer',
    'modules/models-address',
    'modules/models-paymentmethods',
    'hyprlivecontext',
    'modules/checkout/models-checkout-step',
    'modules/checkout/models-shipping-destinations'
],
    function ($, _, Hypr, Backbone, api, CustomerModels, AddressModels, PaymentMethods, HyprLiveContext, CheckoutStep, ShippingDestinations) {

        var PaymentStep = CheckoutStep.extend({
            validation: {
                paymentType: {
                    fn: "validatePaymentType"
                },
                savedPaymentMethodId: {
                    fn: "validateSavedPaymentMethodId"
                },
                'billingContact.email': {
                    pattern: 'email',
                    msg: Hypr.getLabel('emailMissing')
                }
            },
            dataTypes: {
                'isSameBillingShippingAddress': Backbone.MozuModel.DataTypes.Boolean,
                'creditAmountToApply': Backbone.MozuModel.DataTypes.Float
            }, 
            getCurrentPayment: function(){
                var checkout = this.getCheckout();
                var payment = checkout.apiModel.getCurrentPayment();
                return payment;
            },
            getCurrentBillingInfo: function(){
                return this.getCurrentPayment().get('billingInfo');
            },
            getCurrentBillingContact: function(){
                return this.getCurrentBillingInfo().get('billingContact');
            },
            validatePaymentType: function(value, attr) {
                var payment = this.getCurrentPayment();
                var errorMessage = Hypr.getLabel('paymentTypeMissing');
                if (!value) return errorMessage;
                if ((value === "StoreCredit" || value === "GiftCard") && this.nonStoreCreditTotal() > 0 && !payment) return errorMessage;

            },
            validateSavedPaymentMethodId: function (value, attr, computedState) {
                if (this.get('usingSavedCard')) {
                    var isValid = this.get('savedPaymentMethodId');
                    if (!isValid) return Hypr.getLabel('selectASavedCard');
                }

            },
            helpers: ['acceptsMarketing', 'savedPaymentMethods', 'availableStoreCredits', 'applyingCredit', 'maxCreditAmountToApply',
              'activeStoreCredits', 'nonStoreCreditTotal', 'activePayments', 'hasSavedCardPayment', 'availableDigitalCredits', 'digitalCreditPaymentTotal', 'isAnonymousShopper', 'visaCheckoutFlowComplete'],
            acceptsMarketing: function () {
                return this.getCheckout().get('acceptsMarketing');
            },
            visaCheckoutFlowComplete: function() {
                return this.getCurrentPayment().get('paymentWorkflow') === 'VisaCheckout';
            },
            cancelVisaCheckout: function() {
                var self = this;
                var currentPayment = self.getCurrentPayment();
                return self.getCheckout().apiVoidPayment(currentPayment.id).then(function() {
                    self.clear();
                    self.stepStatus('incomplete');
                    // need to re-enable purchase order information if purchase order is available.
                    self.setPurchaseOrderInfo();
                    // Set the defualt payment method for the customer.
                    self.setDefaultPaymentType(self);
                });
            },
            activePayments: function () {
                return this.getCheckout().apiModel.getActivePayments();
            },
            hasSavedCardPayment: function() {
                var currentPayment = this.getCurrentPayment();
                return !!(currentPayment && currentPayment.billingInfo.card && currentPayment.billingInfo.card.paymentServiceCardId);
            },
            nonStoreCreditTotal: function () {
                var me = this,
                    checkout = this.getCheckout(),
                    total = checkout.get('total'),
                    result,
                    activeCredits = this.activeStoreCredits();
                if (!activeCredits) return total;
                result = total - _.reduce(activeCredits, function (sum, credit) {
                    return sum + credit.amountRequested;
                }, 0);
                return me.roundToPlaces(result, 2);
            },
            resetAddressDefaults: function () {
                var billingAddress = this.getCurrentBillingContact().get('address');
                var addressDefaults = billingAddress.defaults;
                billingAddress.set('countryCode', addressDefaults.countryCode);
                billingAddress.set('addressType', addressDefaults.addressType);
                billingAddress.set('candidateValidatedAddresses', addressDefaults.candidateValidatedAddresses);
            },
            savedPaymentMethods: function () {
                var cards = this.getCheckout().get('customer').get('cards').toJSON();
                return cards && cards.length > 0 && cards;
            },
            activeStoreCredits: function () {
                var active = this.getCheckout().apiModel.getActiveStoreCredits();
                return active && active.length > 0 && active;
            },
            availableStoreCredits: function () {
                var checkout = this.getCheckout(),
                    customer = checkout.get('customer'),
                    credits = customer && customer.get('credits'),
                    usedCredits = this.activeStoreCredits(),
                    availableCredits = credits && _.compact(_.map(credits.models, function (credit) {
                        if (!(credit.creditType === 'StoreCredit' || credit.creditType === 'GiftCard'))
                            return false;
                        credit = _.clone(credit);
                        if (usedCredits) _.each(usedCredits, function (uc) {
                            if (uc.billingInfo.storeCreditCode === credit.code) {
                                credit.currentBalance -= uc.amountRequested;
                            }
                        });
                        return credit.currentBalance > 0 ? credit : false;
                    }));
                return availableCredits && availableCredits.length > 0 && availableCredits;
            },

            applyingCredit: function () {
                return this._applyingCredit;
            },
            maxCreditAmountToApply: function () {
                var checkout = this.getCheckout(),
                    total = checkout.get('amountRemainingForPayment'),
                    applyingCredit = this.applyingCredit();
                if (applyingCredit) return Math.min(applyingCredit.currentBalance, total).toFixed(2);
            },
            beginApplyCredit: function () {
                var selectedCredit = this.getCurrentPayment().get('selectedCredit');
                this._oldPaymentType = this.getCurrentPayment().get('paymentType');
                if (selectedCredit) {
                    var applyingCredit = _.findWhere(this.availableStoreCredits(), { code: selectedCredit });
                    if (applyingCredit) {
                        this._applyingCredit = applyingCredit;
                        this.set('creditAmountToApply', this.maxCreditAmountToApply());
                    }
                }
            },            
            closeApplyCredit: function () {
                delete this._applyingCredit;
                this.unset('selectedCredit');
                this.set('paymentType', this._oldPaymentType);
            },
            finishApplyCredit: function () {
                var self = this,
                    checkout = self.getCheckout();
                return checkout.apiAddStoreCredit({
                    storeCreditCode: this.getCurrentPayment().get('selectedCredit'),
                    amount: this.getCurrentPayment().get('creditAmountToApply')
                }).then(function (o) {
                    checkout.set(o.data);
                    self.closeApplyCredit();
                    return checkout.update();
                });
            },
            // digital

            onCreditAmountChanged: function(digCredit, amt) {
                this.applyDigitalCredit(digCredit.get('code'), amt);
            },

            loadCustomerDigitalCredits: function () {
                var self = this,
                    checkout = this.getCheckout(),
                    customer = checkout.get('customer'),
                    activeCredits = this.activeStoreCredits();

                var customerCredits = customer.get('credits');
                if (customerCredits && customerCredits.length > 0) {
                    var currentDate = new Date(),
                        unexpiredDate = new Date(2076, 6, 4);

                    // todo: refactor so conversion & get can re-use - Greg Murray on 2014-07-01 
                    var invalidCredits = customerCredits.filter(function(cred) {
                        var credBalance = cred.get('currentBalance'),
                            credExpDate = cred.get('expirationDate');
                        var expDate = (credExpDate) ? new Date(credExpDate) : unexpiredDate;
                        return (!credBalance || credBalance <= 0 || expDate < currentDate);
                    });
                    _.each(invalidCredits, function(inv) {
                        customerCredits.remove(inv);
                    });
                }
                self._cachedDigitalCredits = customerCredits;

                if (activeCredits) {
                    var userEnteredCredits = _.filter(activeCredits, function(activeCred) {
                        var existingCustomerCredit = self._cachedDigitalCredits.find(function(cred) {
                            return cred.get('code').toLowerCase() === activeCred.billingInfo.storeCreditCode.toLowerCase();
                        });
                        if (!existingCustomerCredit) {
                            return true;
                        }
                        //apply pricing update.
                        existingCustomerCredit.set('isEnabled', true);
                        existingCustomerCredit.set('creditAmountApplied', activeCred.amountRequested);
                        existingCustomerCredit.set('remainingBalance', existingCustomerCredit.calculateRemainingBalance());
                        return false;
                    });
                    if (userEnteredCredits) {
                        this.convertPaymentsToDigitalCredits(userEnteredCredits, customer);
                    }
                }

            },

            convertPaymentsToDigitalCredits: function(activeCredits, customer) {
                var me = this;
                _.each(activeCredits, function (activeCred) {
                    var currentCred = activeCred;
                    return me.retrieveDigitalCredit(customer, currentCred.billingInfo.storeCreditCode, me, currentCred.amountRequested).then(function(digCredit) {
                        me.trigger('orderPayment', me.getCheckout().data, me);
                        return digCredit;
                    });
                });
            },

            availableDigitalCredits: function () {
                if (! this._cachedDigitalCredits) { 
                    this.loadCustomerDigitalCredits();
                }
                return this._cachedDigitalCredits && this._cachedDigitalCredits.length > 0 && this._cachedDigitalCredits;
            },

            refreshBillingInfoAfterAddingStoreCredit: function (order, updatedOrder) {
                var self = this;
                //clearing existing order billing info because information may have been removed (payment info) #68583

                // #73389 only refresh if the payment requirement has changed after adding a store credit.
                var activePayments = this.activePayments();
                var checkout = self.getCheckout();
                var hasNonStoreCreditPayment = (_.filter(activePayments, function (item) { return item.paymentType !== 'StoreCredit'; })).length > 0;
                if ((checkout.get('amountRemainingForPayment') >= 0 && !hasNonStoreCreditPayment) ||
                    (checkout.get('amountRemainingForPayment') < 0 && hasNonStoreCreditPayment)
                    ) {
                    this.getCurrentPayment().get('billingInfo').clear();
                    checkout.set(updatedOrder, { silent: true });
                }
                self.setPurchaseOrderInfo();
                self.setDefaultPaymentType(self);
                self.trigger('orderPayment', updatedOrder, self);

            },

            applyDigitalCredit: function (creditCode, creditAmountToApply, isEnabled) {
                var self = this,
                    checkout = self.getCheckout(),
                    maxCreditAvailable = null;

                this._oldPaymentType = this.getCurrentPayment().get('paymentType');
                var digitalCredit = this._cachedDigitalCredits.filter(function(cred) {
                     return cred.get('code').toLowerCase() === creditCode.toLowerCase();
                });

                if (! digitalCredit || digitalCredit.length === 0) {
                    return self.deferredError(Hypr.getLabel('digitalCodeAlreadyUsed', creditCode), self);
                }
                digitalCredit = digitalCredit[0];
                var previousAmount = digitalCredit.get('creditAmountApplied');
                var previousEnabledState = digitalCredit.get('isEnabled');

                if (!creditAmountToApply && creditAmountToApply !== 0) {
                    creditAmountToApply = self.getMaxCreditToApply(digitalCredit, self);
                }
                
                digitalCredit.set('creditAmountApplied', creditAmountToApply);
                digitalCredit.set('remainingBalance',  digitalCredit.calculateRemainingBalance());
                digitalCredit.set('isEnabled', isEnabled);

                //need to round to prevent being over total by .01
                if (creditAmountToApply > 0) {
                    creditAmountToApply = self.roundToPlaces(creditAmountToApply, 2);
                }

                var activeCreditPayments = this.activeStoreCredits();
                if (activeCreditPayments) {
                    //check if payment applied with this code, remove
                    var sameCreditPayment = _.find(activeCreditPayments, function (cred) {
                        return cred.status !== 'Voided' && cred.billingInfo && cred.billingInfo.storeCreditCode.toLowerCase() === creditCode.toLowerCase();
                    });

                    if (sameCreditPayment) {
                        if (this.areNumbersEqual(sameCreditPayment.amountRequested, creditAmountToApply)) {
                            var deferredSameCredit = api.defer();
                            deferredSameCredit.reject();
                            return deferredSameCredit.promise;
                        }
                        if (creditAmountToApply === 0) {
                            return checkout.apiVoidPayment(sameCreditPayment.id).then(function(o) {
                                checkout.set(o.data);
                                self.setPurchaseOrderInfo();
                                self.setDefaultPaymentType(self);
                                self.trigger('orderPayment', o.data, self);
                                return o;
                            });
                        } else {
                            maxCreditAvailable = self.getMaxCreditToApply(digitalCredit, self, sameCreditPayment.amountRequested);
                            if (creditAmountToApply > maxCreditAvailable) {
                                digitalCredit.set('creditAmountApplied', previousAmount);
                                digitalCredit.set('isEnabled', previousEnabledState);
                                digitalCredit.set('remainingBalance', digitalCredit.calculateRemainingBalance());
                                return self.deferredError(Hypr.getLabel('digitalCreditExceedsBalance'), self);
                            }
                            return checkout.apiVoidPayment(sameCreditPayment.id).then(function (o) {
                                checkout.set(o.data);
                                
                                return checkout.apiAddStoreCredit({
                                    storeCreditCode: creditCode,
                                    amount: creditAmountToApply
                                }).then(function (o) {
                                    self.refreshBillingInfoAfterAddingStoreCredit(checkout, o.data);
                                    return o;
                                });
                            });
                        }
                    }
                }
                if (creditAmountToApply === 0) {
                    return this.getCheckout();
                }

                maxCreditAvailable = self.getMaxCreditToApply(digitalCredit, self);
                if (creditAmountToApply > maxCreditAvailable) {
                    digitalCredit.set('creditAmountApplied', previousAmount);
                    digitalCredit.set('remainingBalance', digitalCredit.calculateRemainingBalance());
                    digitalCredit.set('isEnabled', previousEnabledState);
                    return self.deferredError(Hypr.getLabel('digitalCreditExceedsBalance'), self);
                }

                return checkout.apiAddStoreCredit({
                    storeCreditCode: creditCode,
                    amount: creditAmountToApply,
                    email: self.getCurrentBillingContact().get('email')
                }).then(function (o) {
                    self.refreshBillingInfoAfterAddingStoreCredit(checkout, o.data);
                    return o;
                });
            },

            deferredError: function deferredError(msg, scope) {
                scope.trigger('error', {
                    message: msg
                });
                var deferred = api.defer();
                deferred.reject();

                return deferred.promise;
            },

            areNumbersEqual: function(f1, f2) {
                var epsilon = 0.01; 
                return (Math.abs(f1 - f2)) < epsilon; 
            },

            retrieveDigitalCredit: function (customer, creditCode, me, amountRequested) {
                var self = this;
                return customer.apiGetDigitalCredit(creditCode).then(function (credit) {
                    var creditModel = new PaymentMethods.DigitalCredit(credit.data);
                    creditModel.set('isTiedToCustomer', false);

                    var validateCredit = function() {
                        var now = new Date(),
                            activationDate = creditModel.get('activationDate') ? new Date(creditModel.get('activationDate')) : null,
                            expDate = creditModel.get('expirationDate') ? new Date(creditModel.get('expirationDate')) : null;
                        if (expDate && expDate < now) {
                            return self.deferredError(Hypr.getLabel('expiredCredit', expDate.toLocaleDateString()), self);
                        }
                        if (activationDate && activationDate > now) {
                            return self.deferredError(Hypr.getLabel('digitalCreditNotYetActive', activationDate.toLocaleDateString()), self);
                        }
                        if (!creditModel.get('currentBalance') || creditModel.get('currentBalance') <= 0) {
                            return self.deferredError(Hypr.getLabel('digitalCreditNoRemainingFunds'), self);
                        }
                        return null;
                    };

                    var validate = validateCredit();
                    if (validate !== null) {
                        return null;
                    }
                    
                    var maxAmt = me.getMaxCreditToApply(creditModel, me, amountRequested);
                    if (!!amountRequested && amountRequested < maxAmt) {
                        maxAmt = amountRequested;
                    }
                    creditModel.set('creditAmountApplied', maxAmt);
                    creditModel.set('remainingBalance', creditModel.calculateRemainingBalance());
                    creditModel.set('isEnabled', true);

                    me._cachedDigitalCredits.push(creditModel);
                    me.applyDigitalCredit(creditCode, maxAmt, true);
                    me.trigger('sync', creditModel);
                    return creditModel;
                });
            },

            getDigitalCredit: function () {
                var me = this,
                    checkout = me.getCheckout(),
                    customer = checkout.get('customer');
                var creditCode = this.get('digitalCreditCode');

                var existingDigitalCredit = this._cachedDigitalCredits.filter(function (cred) {
                    return cred.get('code').toLowerCase() === creditCode.toLowerCase();
                });
                if (existingDigitalCredit && existingDigitalCredit.length > 0){
                    me.trigger('error', {
                        message: Hypr.getLabel('digitalCodeAlreadyUsed', creditCode)
                    });
                    // to maintain promise api
                    var deferred = api.defer();
                    deferred.reject();
                    return deferred.promise;
                }
                me.isLoading(true);
                return me.retrieveDigitalCredit(customer, creditCode, me).then(function() {
                    me.isLoading(false);
                    return me;
                });
            },

            getMaxCreditToApply: function(creditModel, scope, toBeVoidedPayment) {
                var remainingTotal = scope.nonStoreCreditTotal();
                if (!!toBeVoidedPayment) {
                    remainingTotal += toBeVoidedPayment;
                }
                var maxAmt = remainingTotal < creditModel.get('currentBalance') ? remainingTotal : creditModel.get('currentBalance');
                return scope.roundToPlaces(maxAmt, 2);
            },

            roundToPlaces: function(amt, numberOfDecimalPlaces) {
                var transmogrifier = Math.pow(10, numberOfDecimalPlaces);
                return Math.round(amt * transmogrifier) / transmogrifier;
            },

            digitalCreditPaymentTotal: function () {
                var activeCreditPayments = this.activeStoreCredits();
                if (!activeCreditPayments)
                    return null;
                return _.reduce(activeCreditPayments, function (sum, credit) {
                    return sum + credit.amountRequested;
                }, 0);
            },

            addRemainingCreditToCustomerAccount: function(creditCode, isEnabled) {
                var self = this;

                var digitalCredit = self._cachedDigitalCredits.find(function(credit) {
                    return credit.code.toLowerCase() === creditCode.toLowerCase();
                });

                if (!digitalCredit) {
                    return self.deferredError(Hypr.getLabel('genericNotFound'), self);
                }
                digitalCredit.set('addRemainderToCustomer', isEnabled);
                return digitalCredit;
            },

            getDigitalCreditsToAddToCustomerAccount: function() {
                return this._cachedDigitalCredits.where({ isEnabled: true, addRemainderToCustomer: true, isTiedToCustomer: false });
            },

            isAnonymousShopper: function() {
                var checkout = this.getCheckout(),
                    customer = checkout.get('customer');
                return (!customer || !customer.id || customer.id <= 1);
            },

            removeCredit: function(id) {
                var checkout = this.getCheckout();
                return checkout.apiVoidPayment(id).then(checkout.update);
            },
            syncPaymentMethod: function (me, newId) {
                me = this.getCurrentPayment().get('billingInfo');
                if (!newId || newId === 'new') {
                    me.get('billingContact').clear();
                    me.get('card').clear();
                    me.get('check').clear();
                    me.unset('paymentType');
                    me.set('usingSavedCard', false);
                } else {
                    me.setSavedPaymentMethod(newId);
                    me.set('usingSavedCard', true);
                }
            },
            setSavedPaymentMethod: function (newId, manualCard) {
                var me = this,
                    customer = me.getCheckout().get('customer'),
                    card = manualCard || customer.get('cards').get(newId),
                    cardBillingContact = card && customer.get('contacts').get(card.get('contactId'));
                if (card) {
                    this.getCurrentPaymentContact().set(cardBillingContact.toJSON(), { silent: true });
                    this.getCurrentPayment().get('billingInfo').get('card').set(card.toJSON());
                    this.getCurrentPayment().get('billingInfo').set('paymentType', 'CreditCard');
                    this.getCurrentPayment().get('billingInfo').set('usingSavedCard', true);
                    if (Hypr.getThemeSetting('isCvvSuppressed')) {
                        me.get('card').set('isCvvOptional', true);
                        if (me.parent.get('amountRemainingForPayment') > 0) {
                            return me.applyPayment();
                        }
                    }
                }
            },
            getPaymentTypeFromCurrentPayment: function () {
                var billingInfoPaymentType = this.get('paymentType'),
                    billingInfoPaymentWorkflow = this.get('paymentWorkflow'),
                    currentPayment = this.getCheckout().apiModel.getCurrentPayment(),
                    currentPaymentType = currentPayment && currentPayment.billingInfo.paymentType,
                    currentPaymentWorkflow = currentPayment && currentPayment.billingInfo.paymentWorkflow,
                    currentBillingContact = currentPayment && currentPayment.billingInfo.billingContact,
                    currentCard = currentPayment && currentPayment.billingInfo.card,
                    currentPurchaseOrder = currentPayment && currentPayment.billingInfo.purchaseorder,
                    purchaseOrderSiteSettings = HyprLiveContext.locals.siteContext.checkoutSettings.purchaseOrder ?
                        HyprLiveContext.locals.siteContext.checkoutSettings.purchasecheckout.isEnabled : false,
                    purchaseOrderCustomerSettings = this.getCheckout().get('customer').get('purchaseOrder') ? 
                        this.getCheckout().get('customer').get('purchaseOrder').isEnabled : false;

                if(purchaseOrderSiteSettings && purchaseOrderCustomerSettings && !currentPayment) {
                    currentPaymentType = 'PurchaseOrder';
                } 

                if (currentPaymentType && (currentPaymentType !== billingInfoPaymentType || currentPaymentWorkflow !== billingInfoPaymentWorkflow)) {
                    this.set('paymentType', currentPaymentType, { silent: true });
                    this.set('paymentWorkflow', currentPaymentWorkflow, { silent: true });
                    this.set('card', currentCard, { silent: true });
                    this.set('billingContact', currentBillingContact, { silent: true });
                    this.set('purchaseOrder', currentPurchaseOrder, { silent: true });
                }
            },
            edit: function () {
                //this.getPaymentTypeFromCurrentPayment();
                CheckoutStep.prototype.edit.apply(this, arguments);
            },
            updatePurchaseOrderAmount: function() {

                var me = this,
                    checkout = me.getCheckout(),
                    currentPurchaseOrder = this.getCurrentBillingInfo().get('purchaseOrder'),
                    pOAvailableBalance = currentPurchaseOrder.get('totalAvailableBalance'),
                    orderAmountRemaining = checkout.get('amountRemainingForPayment'),
                    amount = pOAvailableBalance > orderAmountRemaining ?
                        orderAmountRemaining : pOAvailableBalance;

                if((!this.get('purchaseOrder').get('isEnabled') && this.get('purchaseOrder').selected) || checkout.get('payments').length > 0) {
                    return;
                }


                currentPurchaseOrder.set('amount', amount);
                if(amount < orderAmountRemaining) {
                    currentPurchaseOrder.set('splitPayment', true);
                }

                //refresh ui when split payment is working?
                me.trigger('stepstatuschange'); // trigger a rerender
            },
            isPurchaseOrderEnabled: function() {
                var me = this,
                    checkout = me.getCheckout(),
                    purchaseOrderInfo = checkout ?  checkout.get('customer').get('purchaseOrder') : null,
                    purchaseOrderSiteSettings = HyprLiveContext.locals.siteContext.checkoutSettings.purchaseOrder ?
                        HyprLiveContext.locals.siteContext.checkoutSettings.purchasecheckout.isEnabled : false,
                    purchaseOrderCustomerEnabled = purchaseOrderInfo ? purchaseOrderInfo.isEnabled : false,
                    customerAvailableBalance = purchaseOrderCustomerEnabled ? purchaseOrderInfo.totalAvailableBalance > 0 : false,
                    purchaseOrderEnabled = purchaseOrderSiteSettings && purchaseOrderCustomerEnabled && customerAvailableBalance;

                return purchaseOrderEnabled;
            },
            resetPOInfo: function() {
                var me = this,
                    currentPurchaseOrder = me.get('purchaseOrder');

                currentPurchaseOrder.get('paymentTermOptions').reset();
                currentPurchaseOrder.get('customFields').reset();
                currentPurchaseOrder.get('paymentTerm').clear();

                this.setPurchaseOrderInfo();
            },
            setPurchaseOrderInfo: function() {
                var me = this,
                    checkout = me.getCheckout(),
                    purchaseOrderInfo = checkout ? checkout.get('customer').get('purchaseOrder') : null,
                    purchaseOrderEnabled = this.isPurchaseOrderEnabled(),
                    currentPurchaseOrder = me.get('purchaseOrder'),
                    siteId = require.mozuData('checkout').siteId,
                    currentPurchaseOrderAmount = currentPurchaseOrder.get('amount');

                currentPurchaseOrder.set('isEnabled', purchaseOrderEnabled);
                if(!purchaseOrderEnabled) {
                    // if purchase order isn't enabled, don't populate stuff!
                    return;
                }

                // Breaks the custom field array into individual items, and makes the value
                //  field a first class item against the purchase order model. Also populates the field if the
                //  custom field has a value.
                currentPurchaseOrder.deflateCustomFields();
                // Update models-checkout validation with flat purchaseOrderCustom fields for validation.
                for(var validateField in currentPurchaseOrder.validation) {
                    if(!this.validation['purchasecheckout.'+validateField]) {
                        this.validation['purchasecheckout.'+validateField] = currentPurchaseOrder.validation[validateField];
                    }
                    // Is this level needed?
                    if(!this.parent.validation['billingInfo.purchasecheckout.'+validateField]) {
                        this.parent.validation['billingInfo.purchasecheckout.'+validateField] =
                            currentPurchaseOrder.validation[validateField];
                    }
                }

                // Set information, only if the current purchase order does not have it:
                var amount = purchaseOrderInfo.totalAvailableBalance > checkout.get('amountRemainingForPayment') ?
                        checkout.get('amountRemainingForPayment') : purchaseOrderInfo.totalAvailableBalance;

                currentPurchaseOrder.set('amount', amount);

                currentPurchaseOrder.set('totalAvailableBalance', purchaseOrderInfo.totalAvailableBalance);
                currentPurchaseOrder.set('availableBalance', purchaseOrderInfo.availableBalance);
                currentPurchaseOrder.set('creditLimit', purchaseOrderInfo.creditLimit);

                if(purchaseOrderInfo.totalAvailableBalance < checkout.get('amountRemainingForPayment')) {
                    currentPurchaseOrder.set('splitPayment', true);
                }
                
                var paymentTerms = [];
                purchaseOrderInfo.paymentTerms.forEach(function(term) {
                    if(term.siteId === siteId) {
                        var newTerm = {};
                        newTerm.code = term.code;
                        newTerm.description = term.description;
                        paymentTerms.push(term);
                    }
                });
                currentPurchaseOrder.set('paymentTermOptions', paymentTerms, {silent: true});

                var paymentTermOptions = currentPurchaseOrder.get('paymentTermOptions');
                if(paymentTermOptions.length === 1) {
                    var paymentTerm = {};
                    paymentTerm.code = paymentTermOptions.models[0].get('code');
                    paymentTerm.description = paymentTermOptions.models[0].get('description');
                    currentPurchaseOrder.set('paymentTerm', paymentTerm);
                }

                this.setPurchaseOrderBillingInfo();
            },
            setPurchaseOrderBillingInfo: function() {
                var me = this,
                    checkout = me.getCheckout(),
                    purchaseOrderEnabled = this.isPurchaseOrderEnabled(),
                    currentPurchaseOrder = me.get('purchaseOrder'),
                    contacts = checkout ? checkout.get('customer').get('contacts') : null;
                if(purchaseOrderEnabled) {
                    if(currentPurchaseOrder.selected && contacts.length > 0) {
                        var foundBillingContact = contacts.models.find(function(item){
                            return item.get('isPrimaryBillingContact');
                                
                        });

                        if(foundBillingContact) {
                            this.getCurrentBillingContact().set('billingContact', foundBillingContact, {silent: true});
                            currentPurchaseOrder.set('usingBillingContact', true);
                        }
                    }
                }
            },
            setPurchaseOrderPaymentTerm: function(termCode) {
                var currentPurchaseOrder = this.getCurrentBillingInfo().get('purchaseOrder'),
                    paymentTermOptions = currentPurchaseOrder.get('paymentTermOptions');
                    var foundTerm = paymentTermOptions.find(function(term) {
                        return term.get('code') === termCode;
                    });
                    currentPurchaseOrder.set('paymentTerm', foundTerm, {silent: true});
            },
            initialize: function () {
                var me = this;
                var billingContact;

                _.defer(function () {
                    billingContact = this.getCurrentBillingContact();
                    this.selectPaymentType(this, this.get('paymentType'));
                    //set purchaseOrder defaults here.
                    me.setPurchaseOrderInfo();
                    //me.getPaymentTypeFromCurrentPayment();

                    var savedCardId = me.getCurrentBillingInfo().get('card.paymentServiceCardId');
                    me.set('savedPaymentMethodId', savedCardId, { silent: true });
                    me.setSavedPaymentMethod(savedCardId);

                    if (!savedCardId) {
                        me.setDefaultPaymentType(me);
                    }

                    me.on('change:usingSavedCard', function (me, yes) {
                        if (!yes) {
                            me.getCurrentBillingInfo().get('card').clear();
                            me.set('usingSavedCard', false);
                        }
                        else {
                            me.set('isSameBillingShippingAddress', false);
                            me.setSavedPaymentMethod(me.get('savedPaymentMethodId'));
                        }
                    });
                });
                
                this.on('change:paymentType', this.selectPaymentType);
               
                this.on('change:isSameBillingShippingAddress', function (model, wellIsIt) {
                    if (wellIsIt) {
                         billingContact.set(this.parent.get('destinations').at(0).get('destinationContact'), { silent: true });
                    } else if (billingContact) {
                        // if they initially checked the checkbox, then later they decided to uncheck it... remove the id so that updates don't update
                        // the original address, instead create a new contact address.
                        // We also unset contactId to prevent id from getting reset later.
                        billingContact.unset('id', { silent: true });
                        billingContact.unset('contactId', { silent: true });
                    }
                });
                this.on('change:savedPaymentMethodId', this.syncPaymentMethod);
                this._cachedDigitalCredits = null;

                _.bindAll(this, 'applyPayment', 'markComplete');
            },
            selectPaymentType: function(me, newPaymentType) {
                me = me.getCurrentBillingInfo();
                if (!me.changed || !me.changed.paymentWorkflow) {
                    me.set('paymentWorkflow', 'Mozu');
                }
                me.get('check').selected = newPaymentType === 'Check';
                me.get('card').selected = newPaymentType === 'CreditCard';
                me.get('purchaseOrder').selected = newPaymentType === 'PurchaseOrder';
                if(newPaymentType === 'PurchaseOrder') {
                    me.setPurchaseOrderBillingInfo();
                }
            },
            setDefaultPaymentType: function(me) {
                if(me.isPurchaseOrderEnabled()) {
                    me.getCurrentBillingInfo().set('paymentType', 'PurchaseOrder');
                    me.selectPaymentType(me, 'PurchaseOrder');
                } else {
                    me.getCurrentBillingInfo().set('paymentType', 'CreditCard');
                    me.selectPaymentType(me, 'CreditCard');
                    if (me.savedPaymentMethods() && me.savedPaymentMethods().length > 0) {
                        me.set('usingSavedCard', true);
                    }
                }
            },
            calculateStepStatus: function () {
                var shippingStepComplete = this.parent.get('shippingStep').stepStatus() === 'complete',
                    shippingInfoComplete = this.parent.get('shippingInfo').stepStatus() === 'complete',
                    activePayments = this.activePayments(),
                    thereAreActivePayments = activePayments.length > 0,
                    paymentTypeIsCard = activePayments && !!_.findWhere(activePayments, { paymentType: 'CreditCard' }),
                    balanceNotPositive = this.parent.get('amountRemainingForPayment') <= 0;

                if (paymentTypeIsCard && !Hypr.getThemeSetting('isCvvSuppressed')) return this.stepStatus('incomplete'); // initial state for CVV entry

                if (!shippingStepComplete || !shippingInfoComplete) return this.stepStatus('new');

                if (thereAreActivePayments && (balanceNotPositive || (this.getCurrentBillingInfo().get('paymentType') === 'PaypalExpress' && window.location.href.indexOf('PaypalExpress=complete') !== -1))) return this.stepStatus('complete');
                return this.stepStatus('incomplete');

            },
            hasPaymentChanged: function(payment) {

                // fix this for purchase orders, currently it constantly voids, then re-applys the payment even if nothing changes.
                function normalizeBillingInfos(obj) {
                    return {
                        paymentType: obj.paymentType,
                        billingContact: _.extend(_.pick(obj.billingContact,
                            'email',
                            'firstName',
                            'lastNameOrSurname',
                            'phoneNumbers'),
                        {
                            address: obj.billingContact.address ? _.pick(obj.billingContact.address, 
                                'address1',
                                'address2',
                                'addressType',
                                'cityOrTown',
                                'countryCode',
                                'postalOrZipCode',
                                'stateOrProvince') : {}
                        }),
                        card: obj.card ? _.extend(_.pick(obj.card,
                            'expireMonth',
                            'expireYear',
                            'nameOnCard',
                            'isSavedCardInfo'),
                        {
                            cardType: obj.card.paymentOrCardType || obj.card.cardType,
                            cardNumber: obj.card.cardNumberPartOrMask || obj.card.cardNumberPart || obj.card.cardNumber,
                            id: obj.card.paymentServiceCardId || obj.card.id,
                            isCardInfoSaved: obj.card.isCardInfoSaved || false
                        }) : {},
                        purchaseOrder: obj.purchaseOrder || {},
                        check: obj.check || {}
                    };
                }

                var normalizedSavedPaymentInfo = normalizeBillingInfos(payment.billingInfo);
                var normalizedLiveBillingInfo = normalizeBillingInfos(this.toJSON());

                if (payment.paymentWorkflow === 'VisaCheckout') {
                    normalizedLiveBillingInfo.billingContact.address.addressType = normalizedSavedPaymentInfo.billingContact.address.addressType;
                }
                
                return !_.isEqual(normalizedSavedPaymentInfo, normalizedLiveBillingInfo);
            },
            submit: function () {
                
                var checkout = this.getCheckout();
                // just can't sync these emails right
                checkout.syncBillingAndCustomerEmail();

                // This needs to be ahead of validation so we can check if visa checkout is being used.
                var currentPayment = checkout.apiModel.getCurrentPayment();

                // the card needs to know if this is a saved card or not.
                this.getCurrentBillingInfo().get('card').set('isSavedCard', this.getCurrentBillingInfo().get('usingSavedCard'));
                // the card needs to know if this is Visa checkout (or Amazon? TBD)
                if (currentPayment) {
                    this.getCurrentBillingInfo().get('card').set('isVisaCheckout', currentPayment.paymentWorkflow.toLowerCase() === 'visacheckout');
                }

                var val = this.validate();

                if (this.nonStoreCreditTotal() > 0 && val) {
                    // display errors:
                    var error = {"items":[]};
                    for (var key in val) {
                        if (val.hasOwnProperty(key)) {
                            var errorItem = {};
                            errorItem.name = key;
                            errorItem.message = key.substring(0, ".") + val[key];
                            error.items.push(errorItem);
                        }
                    }
                    if (error.items.length > 0) {
                        checkout.onCheckoutError(error);
                    }
                    return false;
                }

                var card = this.getCurrentBillingInfo().get('card');
                if(this.getCurrentBillingInfo().get('paymentType').toLowerCase() === "purchaseorder") {
                    this.getCurrentBillingInfo().get('purchaseOrder').inflateCustomFields();
                }

                if (!currentPayment) {
                    return this.applyPayment();
                } else if (this.hasPaymentChanged(currentPayment)) {
                    return checkout.apiVoidPayment(currentPayment.id).then(this.applyPayment);
                } else if (card.get('cvv') && card.get('paymentServiceCardId')) {
                    return card.apiSave().then(this.markComplete, checkout.onCheckoutError);
                } else {
                    this.markComplete();
                }
            },
            applyPayment: function () {
                var self = this, checkout = this.getCheckout();
                this.syncApiModel();
                if (this.nonStoreCreditTotal() > 0) {
                    return checkout.apiAddPayment().then(function() {
                        var payment = this.getCurrentPayment();
                        var modelCard, modelCvv;
                        var activePayments = checkout.apiModel.getActivePayments();
                        var creditCardPayment = activePayments && _.findWhere(activePayments, { paymentType: 'CreditCard' });
                        //Clear card if no credit card payments exists
                        if (!creditCardPayment && self.get('card')) {
                            self.get('card').clear();
                        }
                        if (payment) {
                            switch (payment.paymentType) {
                                case 'CreditCard':
                                    modelCard = self.getCurrentBillingInfo().get('card');
                                    modelCvv = modelCard.get('cvv');
                                    if (
                                        modelCvv && modelCvv.indexOf('*') === -1 // CVV exists and is not masked
                                    ) {
                                        modelCard.set('cvv', '***');
                                        // to hide CVV once it has been sent to the paymentservice
                                    }

                                    self.markComplete();
                                    break;
                                default:
                                    self.markComplete();
                            }
                        }
                    });
                } else {
                    this.markComplete();
                }
            },

            markComplete: function () {
                this.stepStatus('complete');
                this.isLoading(false);
                var checkout = this.getCheckout();
                _.defer(function() { 
                    checkout.isReady(true);   
                });
            },
            toJSON: function(options) {
                var j = CheckoutStep.prototype.toJSON.apply(this, arguments), loggedInEmail;
                if (this.nonStoreCreditTotal() === 0 && j.billingContact) {
                    delete j.billingContact.address;
                }
                if (j.billingContact && !j.billingContact.email) {
                    j.billingContact.email = this.getCheckout().get('customer.emailAddress');
                }
                return j;
            }
        });

        return PaymentStep;
    }
);