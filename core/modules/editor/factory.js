/*\
title: $:/core/modules/editor/factory.js
type: application/javascript
module-type: library

Factory for constructing text editor widgets with specified engines for the toolbar and non-toolbar cases

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var DEFAULT_MIN_TEXT_AREA_HEIGHT = "100px"; // Minimum height of textareas in pixels

// Configuration tiddlers
var HEIGHT_MODE_TITLE = "$:/config/TextEditor/EditorHeight/Mode";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

function editTextWidgetFactory(toolbarEngine,nonToolbarEngine) {

	var EditTextWidget = function(parseTreeNode,options) {
		// Initialise the editor operations if they've not been done already
		if(!this.editorOperations) {
			EditTextWidget.prototype.editorOperations = {};
			$tw.modules.applyMethods("texteditoroperation",this.editorOperations);
		}
		this.initialise(parseTreeNode,options);
	};

	/*
	Inherit from the base widget class
	*/
	EditTextWidget.prototype = new Widget();

	/*
	Render this widget into the DOM
	*/
	EditTextWidget.prototype.render = function(parent,nextSibling) {
		// Save the parent dom node
		this.parentDomNode = parent;
		// Compute our attributes
		this.computeAttributes();
		// Execute our logic
		this.execute();
		// Create the wrapper for the toolbar and render its content
		if(this.editShowToolbar) {
			this.toolbarNode = this.document.createElement("div");
			this.toolbarNode.className = "tc-editor-toolbar";
			parent.insertBefore(this.toolbarNode,nextSibling);
			this.renderChildren(this.toolbarNode,null);
			this.domNodes.push(this.toolbarNode);
		}
		// Create our element
		var editInfo = this.getEditInfo(),
			Engine = this.editShowToolbar ? toolbarEngine : nonToolbarEngine;
		this.engine = new Engine({
				widget: this,
				value: editInfo.value,
				type: editInfo.type,
				parentNode: parent,
				nextSibling: nextSibling
			});
		// Call the postRender hook
		if(this.postRender) {
			this.postRender();
		}
		// Fix height
		this.engine.fixHeight();
		// Focus if required
		if(this.editFocus === "true" || this.editFocus === "yes") {
			this.engine.focus();
		}
		// Add widget message listeners
		this.addEventListeners([
			{type: "tm-edit-text-operation", handler: "handleEditTextOperationMessage"}
		]);
	};

	/*
	Get the tiddler being edited and current value
	*/
	EditTextWidget.prototype.getEditInfo = function() {
		// Get the edit value
		var self = this,
			value,
			type = "text/plain",
			update;
		if(this.editIndex) {
			value = this.wiki.extractTiddlerDataItem(this.editTitle,this.editIndex,this.editDefault);
			update = function(value) {
				var data = self.wiki.getTiddlerData(self.editTitle,{});
				if(data[self.editIndex] !== value) {
					data[self.editIndex] = value;
					self.wiki.setTiddlerData(self.editTitle,data);
				}
			};
		} else {
			// Get the current tiddler and the field name
			var tiddler = this.wiki.getTiddler(this.editTitle);
			if(tiddler) {
				// If we've got a tiddler, the value to display is the field string value
				value = tiddler.getFieldString(this.editField);
				if(this.editField === "text") {
					type = tiddler.fields.type || "text/vnd.tiddlywiki";
				}
			} else {
				// Otherwise, we need to construct a default value for the editor
				switch(this.editField) {
					case "text":
						value = "Type the text for the tiddler '" + this.editTitle + "'";
						type = "text/vnd.tiddlywiki";
						break;
					case "title":
						value = this.editTitle;
						break;
					default:
						value = "";
						break;
				}
				if(this.editDefault !== undefined) {
					value = this.editDefault;
				}
			}
			update = function(value) {
				var tiddler = self.wiki.getTiddler(self.editTitle),
					updateFields = {
						title: self.editTitle
					};
				updateFields[self.editField] = value;
				self.wiki.addTiddler(new $tw.Tiddler(self.wiki.getCreationFields(),tiddler,updateFields,self.wiki.getModificationFields()));
			};
		}
		if(this.editType) {
			type = this.editType;
		}
		return {value: value || "", type: type, update: update};
	};

	/*
	Handle an edit text operation message from the toolbar
	*/
	EditTextWidget.prototype.handleEditTextOperationMessage = function(event) {
		// Prepare information about the operation
		var operation = this.engine.createTextOperation();
		// Invoke the handler for the selected operation
		var handler = this.editorOperations[event.param];
		if(handler) {
			handler.call(this,event,operation);
		}
		// Execute the operation via the engine
		var newText = this.engine.executeTextOperation(operation);
		// Fix the tiddler height and save changes
		this.engine.fixHeight();
		this.saveChanges(newText);
	};

	/*
	Compute the internal state of the widget
	*/
	EditTextWidget.prototype.execute = function() {
		// Get our parameters
		this.editTitle = this.getAttribute("tiddler",this.getVariable("currentTiddler"));
		this.editField = this.getAttribute("field","text");
		this.editIndex = this.getAttribute("index");
		this.editDefault = this.getAttribute("default");
		this.editClass = this.getAttribute("class");
		this.editPlaceholder = this.getAttribute("placeholder");
		this.editSize = this.getAttribute("size");
		this.editRows = this.getAttribute("rows");
		this.editAutoHeight = this.wiki.getTiddlerText(HEIGHT_MODE_TITLE,"auto");
		this.editAutoHeight = this.getAttribute("autoHeight",this.editAutoHeight === "auto" ? "yes" : "no") === "yes";
		this.editMinHeight = this.getAttribute("minHeight",DEFAULT_MIN_TEXT_AREA_HEIGHT);
		this.editFocusPopup = this.getAttribute("focusPopup");
		this.editFocus = this.getAttribute("focus");
		// Get the default editor element tag and type
		var tag,type;
		if(this.editField === "text") {
			tag = "textarea";
		} else {
			tag = "input";
			var fieldModule = $tw.Tiddler.fieldModules[this.editField];
			if(fieldModule && fieldModule.editTag) {
				tag = fieldModule.editTag;
			}
			if(fieldModule && fieldModule.editType) {
				type = fieldModule.editType;
			}
			type = type || "text";
		}
		// Get the rest of our parameters
		this.editTag = this.getAttribute("tag",tag);
		this.editType = this.getAttribute("type",type);
		// Make the child widgets
		this.makeChildWidgets();
		// Determine whether to show the toolbar
		this.editShowToolbar = !!(this.children && this.children.length > 0);
	};

	/*
	Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
	*/
	EditTextWidget.prototype.refresh = function(changedTiddlers) {
		var changedAttributes = this.computeAttributes();
		// Completely rerender if any of our attributes have changed
		if(changedAttributes.tiddler || changedAttributes.field || changedAttributes.index || changedAttributes["default"] || changedAttributes["class"] || changedAttributes.placeholder || changedAttributes.size || changedAttributes.autoHeight || changedAttributes.minHeight || changedAttributes.focusPopup ||  changedAttributes.rows || changedTiddlers[HEIGHT_MODE_TITLE]) {
			this.refreshSelf();
			return true;
		} else if(changedTiddlers[this.editTitle]) {
			var editInfo = this.getEditInfo();
			this.updateEditor(editInfo.value,editInfo.type);
		}
		this.engine.fixHeight();
		return this.refreshChildren(changedTiddlers);
	};

	/*
	Update the editor with new text. This method is separate from updateEditorDomNode()
	so that subclasses can override updateEditor() and still use updateEditorDomNode()
	*/
	EditTextWidget.prototype.updateEditor = function(text,type) {
		this.updateEditorDomNode(text,type);
	};

	/*
	Update the editor dom node with new text
	*/
	EditTextWidget.prototype.updateEditorDomNode = function(text,type) {
		this.engine.setText(text,type);
	};

	/*
	Save changes back to the tiddler store
	*/
	EditTextWidget.prototype.saveChanges = function(text) {
		var editInfo = this.getEditInfo();
		if(text !== editInfo.value) {
			editInfo.update(text);
		}
	};

	/*
	Handle a dom "keydown" event, which we'll bubble up to our container for the keyboard widgets benefit
	*/
	EditTextWidget.prototype.handleKeydownEvent = function(event) {
		// Check for a keyboard shortcut
		if(this.toolbarNode) {
			var shortcutElements = this.toolbarNode.querySelectorAll("[data-tw-keyboard-shortcut]");
			for(var index=0; index<shortcutElements.length; index++) {
				var el = shortcutElements[index],
					shortcutData = el.getAttribute("data-tw-keyboard-shortcut"),
					keyInfoArray = $tw.keyboardManager.parseKeyDescriptors(shortcutData,{
						wiki: this.wiki
					});
				if($tw.keyboardManager.checkKeyDescriptors(event,keyInfoArray)) {
					var clickEvent = this.document.createEvent("Events");
				    clickEvent.initEvent("click",true,false);
				    el.dispatchEvent(clickEvent);
					event.preventDefault();
					event.stopPropagation();
					return true;			
				}
			}
		}
		// Propogate the event to the container
		if(this.propogateKeydownEvent(event)) {
			// Ignore the keydown if it was already handled
			event.preventDefault();
			event.stopPropagation();
			return true;
		}
		// Otherwise, process the keydown normally
		return false;
	};

	/*
	Propogate keydown events to our container for the keyboard widgets benefit
	*/
	EditTextWidget.prototype.propogateKeydownEvent = function(event) {
		var newEvent = this.document.createEventObject ? this.document.createEventObject() : this.document.createEvent("Events");
		if(newEvent.initEvent) {
			newEvent.initEvent("keydown", true, true);
		}
		newEvent.keyCode = event.keyCode;
		newEvent.which = event.which;
		newEvent.metaKey = event.metaKey;
		newEvent.ctrlKey = event.ctrlKey;
		newEvent.altKey = event.altKey;
		newEvent.shiftKey = event.shiftKey;
		return !this.parentDomNode.dispatchEvent(newEvent);
	};

	/*
	Execute the specified command on the current engine
	*/
	EditTextWidget.prototype.execCommand = function(command /*, <args> */) {
		this.engine.execCommand.apply(this.engine,Array.prototype.slice.call(arguments,0));
	};

	return EditTextWidget;

}

exports.editTextWidgetFactory = editTextWidgetFactory;

})();
