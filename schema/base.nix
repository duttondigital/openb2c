# Base module: defines option types for tables, relationships, operations, effects
{ lib, config, ... }:

let
  logoType = lib.types.submodule {
    options = {
      src = lib.mkOption {
        type = lib.types.either lib.types.str lib.types.path;
        description = "Logo URL or Nix path copied into generated UI assets.";
      };
      alt = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Accessible logo alternative text. Defaults to '<organization name> logo'.";
      };
    };
  };

  # Organization metadata describes the top-level entity the generated app belongs to.
  organizationType = lib.types.submodule {
    options = {
      name = lib.mkOption {
        type = lib.types.str;
        default = "OpenB2C";
        description = "Human-readable organization or product name.";
      };
      description = lib.mkOption {
        type = lib.types.str;
        default = "Generated OpenB2C organization";
        description = "Organization or product description.";
      };
      logo = lib.mkOption {
        type = lib.types.nullOr logoType;
        default = null;
        description = "Optional logo displayed beside generated app titles.";
      };
    };
  };

  fieldMetadataType = lib.types.submodule {
    options = {
      label = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Human-readable field label for generated API descriptions and UI.";
      };
      helpText = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Short helper text shown beside generated inputs.";
      };
      placeholder = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Generated input placeholder.";
      };
      format = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Semantic field format such as email, date, time, url, money, or textarea.";
      };
      displayPriority = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Lower values appear earlier in generated forms, lists, and detail views.";
      };
      privacy = lib.mkOption {
        type = lib.types.enum [ "public" "internal" "sensitive" "secret" ];
        default = "public";
        description = "Field privacy classification for generated clients and API metadata.";
      };
      redact = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether generated API responses should omit this field.";
      };
    };
  };

  fieldValidationType = lib.types.submodule {
    options = {
      minLength = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Minimum string length.";
      };
      maxLength = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Maximum string length.";
      };
      minimum = lib.mkOption {
        type = lib.types.nullOr lib.types.number;
        default = null;
        description = "Minimum numeric value.";
      };
      maximum = lib.mkOption {
        type = lib.types.nullOr lib.types.number;
        default = null;
        description = "Maximum numeric value.";
      };
      pattern = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "JavaScript-compatible regular expression pattern.";
      };
      enum = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Allowed finite string values.";
      };
    };
  };

  # Column definition
  columnType = lib.types.submodule {
    options = {
      type = lib.mkOption { type = lib.types.str; };
      pk = lib.mkOption { type = lib.types.bool; default = false; };
      auto = lib.mkOption { type = lib.types.bool; default = false; };
      required = lib.mkOption { type = lib.types.bool; default = false; };
      unique = lib.mkOption { type = lib.types.bool; default = false; };
      default = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      references = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      metadata = lib.mkOption {
        type = fieldMetadataType;
        default = {};
        description = "Presentation, ordering, and privacy metadata for generated outputs.";
      };
      validation = lib.mkOption {
        type = fieldValidationType;
        default = {};
        description = "Per-field validation constraints for generated API schemas and services.";
      };
    };
  };

  # Structured reference to a table field. These are generated under
  # `config.refs.<table>.<field>` so policy can avoid stringly references.
  fieldRefType = lib.types.submodule {
    options = {
      table = lib.mkOption { type = lib.types.str; };
      field = lib.mkOption { type = lib.types.str; };
      references = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
    };
  };

  # Record-level relationship between auth.userId and a resource field.
  relationshipType = lib.types.submodule {
    options = {
      field = lib.mkOption {
        type = fieldRefType;
        description = "Structured field reference implementing this relationship.";
      };
    };
  };

  relationshipSpecType = lib.types.either lib.types.str relationshipType;

  ecommerceOptionType = lib.types.submodule {
    options = {
      field = lib.mkOption {
        type = lib.types.nullOr fieldRefType;
        default = null;
        description = "Optional target field this configurable purchase option writes to.";
      };
      type = lib.mkOption {
        type = lib.types.str;
        default = "text";
        description = "UI/input type for this option.";
      };
      label = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Human-readable option label.";
      };
      default = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Default option value.";
      };
      choices = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Allowed user-facing choices, when finite.";
      };
      required = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether this option must be provided.";
      };
      min = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Minimum numeric value.";
      };
      max = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Maximum numeric value.";
      };
    };
  };

  ecommerceType = lib.types.submodule {
    options = {
      enabled = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Enable generated catalog, cart, checkout, settlement, and order flows.";
      };
      catalog = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            title = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            description = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            price = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            groupBy = lib.mkOption { type = lib.types.listOf fieldRefType; default = []; };
            variantFields = lib.mkOption { type = lib.types.listOf fieldRefType; default = []; };
            availability = lib.mkOption {
              type = lib.types.submodule {
                options = {
                  field = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
                  available = lib.mkOption { type = lib.types.str; default = "available"; };
                };
              };
              default = {};
            };
          };
        };
        default = {};
      };
      order = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            user = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            status = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            amount = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            currency = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            expiresAt = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            paymentReference = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            client = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            pendingStatus = lib.mkOption { type = lib.types.str; default = "checkout_pending"; };
            paidStatus = lib.mkOption { type = lib.types.str; default = "paid"; };
            expiredStatus = lib.mkOption { type = lib.types.str; default = "expired"; };
            cancelledStatus = lib.mkOption { type = lib.types.str; default = "cancelled"; };
          };
        };
        default = {};
      };
      lineItem = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            catalogItem = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            user = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            price = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            status = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            quantity = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            reservedStatus = lib.mkOption { type = lib.types.str; default = "reserved"; };
            fulfilledStatus = lib.mkOption { type = lib.types.str; default = "fulfilled"; };
            cancelledStatus = lib.mkOption { type = lib.types.str; default = "cancelled"; };
            options = lib.mkOption { type = lib.types.attrsOf ecommerceOptionType; default = {}; };
          };
        };
        default = {};
      };
      orderLine = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            order = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            lineItem = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
          };
        };
        default = {};
      };
      transaction = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            user = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            amount = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            type = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            status = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            reference = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            client = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            purchaseType = lib.mkOption { type = lib.types.str; default = "purchase"; };
            pendingStatus = lib.mkOption { type = lib.types.str; default = "pending"; };
            completedStatus = lib.mkOption { type = lib.types.str; default = "completed"; };
            failedStatus = lib.mkOption { type = lib.types.str; default = "failed"; };
          };
        };
        default = {};
      };
      transactionLine = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            transaction = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            lineItem = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
          };
        };
        default = {};
      };
      checkout = lib.mkOption {
        type = lib.types.submodule {
          options = {
            currency = lib.mkOption { type = lib.types.str; default = "GBP"; };
            expiryMinutes = lib.mkOption { type = lib.types.int; default = 15; };
            maxQuantity = lib.mkOption { type = lib.types.int; default = 20; };
            maxLines = lib.mkOption { type = lib.types.int; default = 50; };
          };
        };
        default = {};
      };
      compatibility = lib.mkOption {
        type = lib.types.submodule {
          options = {
            bookingAliases = lib.mkOption {
              type = lib.types.bool;
              default = false;
              description = "Expose deprecated booking-specific commerce aliases for old clients.";
            };
          };
        };
        default = {};
      };
    };
  };

  indexType = lib.types.submodule {
    options = {
      columns = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        description = "Columns covered by the index, in order.";
      };
      unique = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether this index enforces uniqueness.";
      };
    };
  };

  # Effect types
  effectType = lib.types.submodule {
    options = {
      emit = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      notify = lib.mkOption {
        type = lib.types.nullOr (lib.types.submodule {
          options = {
            channel = lib.mkOption { type = lib.types.str; };
            template = lib.mkOption { type = lib.types.str; };
            to = lib.mkOption { type = lib.types.str; default = "customer"; };
          };
        });
        default = null;
      };
      call = lib.mkOption {
        type = lib.types.nullOr (lib.types.submodule {
          options = {
            service = lib.mkOption { type = lib.types.str; };
            action = lib.mkOption { type = lib.types.str; };
          };
        });
        default = null;
      };
    };
  };

  # Cascade update
  cascadeType = lib.types.submodule {
    options = {
      entity = lib.mkOption { type = lib.types.str; };
      via = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      set = lib.mkOption { type = lib.types.attrsOf lib.types.str; default = {}; };
    };
  };

  # Operation definition
  operationType = lib.types.submodule {
    options = {
      guard = lib.mkOption {
        type = lib.types.nullOr lib.types.attrs;  # Expression AST
        default = null;
        description = "Precondition expression (built with lib/expr.nix)";
      };
      relationships = lib.mkOption {
        type = lib.types.nullOr (lib.types.listOf relationshipSpecType);
        default = null;
        description = "Record relationships that permit this operation. Strings resolve by convention to <relationship>_id fields.";
      };
      public = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Allow this operation without an authenticated scope.";
      };
      scope = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Optional permission scope override. Defaults to <entity>.<operation>.";
      };
      set = lib.mkOption {
        type = lib.types.attrsOf lib.types.str;
        default = {};
        description = "Fields to update";
      };
      cascade = lib.mkOption {
        type = lib.types.listOf cascadeType;
        default = [];
        description = "Cascading updates to related entities";
      };
      effects = lib.mkOption {
        type = lib.types.listOf effectType;
        default = [];
        description = "Side effects to trigger";
      };
    };
  };

in {
  options = {
    organization = lib.mkOption {
      type = organizationType;
      default = {};
      description = "Top-level organization or product metadata.";
    };

    tables = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf columnType);
      default = {};
      description = "Database table definitions";
    };

    refs = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf fieldRefType);
      default = lib.mapAttrs (table: cols:
        lib.mapAttrs (field: col: {
          inherit table field;
          references = col.references;
        }) cols
      ) config.tables;
      description = "Structured references for table fields.";
    };

    relationships = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf relationshipType);
      default = {};
      description = "Record relationship definitions per entity.";
    };

    indexes = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf indexType);
      default = {};
      description = "Database indexes per table.";
    };

    operations = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf operationType);
      default = {};
      description = "Operations per entity (e.g., operations.ticket.confirm)";
    };

    ecommerce = lib.mkOption {
      type = ecommerceType;
      default = {};
      description = "Generic catalog/cart/checkout commerce configuration.";
    };
  };
}
