{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.production_material = {
    id = { type = "integer"; pk = true; auto = true; };
    production_id = {
      type = "integer";
      required = true;
      references = "production(id)";
      metadata = {
        label = "Production";
        displayPriority = 10;
      };
      relationship = {
        label = "Production";
        description = "Production this material belongs to.";
        targetLabel = config.refs.production.title;
      };
    };
    title = {
      type = "text";
      required = true;
      metadata = {
        label = "Material";
        placeholder = "Current vocal score";
        displayPriority = 20;
      };
      validation.maxLength = 160;
    };
    kind = {
      type = "text";
      default = "'score'";
      metadata = {
        label = "Kind";
        displayPriority = 30;
      };
      validation.enum = [ "score" "script" "cut_list" "rehearsal_note" "briefing" "media" "other" ];
    };
    visibility = {
      type = "text";
      default = "'private'";
      metadata = {
        label = "Visibility";
        displayPriority = 40;
      };
      validation.enum = [ "private" "participants" "public" ];
    };
    status = {
      type = "text";
      default = "'draft'";
      metadata = {
        label = "Status";
        displayPriority = 50;
      };
      validation.enum = [ "draft" "current" "archived" ];
    };
    description = {
      type = "text";
      metadata = {
        label = "Description";
        format = "textarea";
        displayPriority = 60;
      };
    };
    created_at = {
      type = "text";
      default = "CURRENT_TIMESTAMP";
      metadata = {
        label = "Created";
        format = "date-time";
        displayPriority = 1000;
      };
    };
    updated_at = {
      type = "text";
      default = "CURRENT_TIMESTAMP";
      metadata = {
        label = "Updated";
        format = "date-time";
        displayPriority = 1010;
      };
    };
  };

  tables.material_version = {
    id = { type = "integer"; pk = true; auto = true; };
    material_id = {
      type = "integer";
      required = true;
      references = "production_material(id)";
      metadata = {
        label = "Material";
        displayPriority = 10;
      };
      relationship = {
        label = "Material";
        description = "Material this version belongs to.";
        targetLabel = config.refs.production_material.title;
      };
    };
    version_label = {
      type = "text";
      required = true;
      metadata = {
        label = "Version";
        placeholder = "v1";
        displayPriority = 20;
      };
      validation.maxLength = 80;
    };
    storage_uri = {
      type = "text";
      required = true;
      metadata = {
        label = "Storage URI";
        privacy = "internal";
        displayPriority = 30;
      };
    };
    checksum = {
      type = "text";
      metadata = {
        label = "Checksum";
        privacy = "internal";
        displayPriority = 40;
      };
    };
    status = {
      type = "text";
      default = "'draft'";
      metadata = {
        label = "Status";
        displayPriority = 50;
      };
      validation.enum = [ "draft" "current" "superseded" "archived" ];
    };
    notes = {
      type = "text";
      metadata = {
        label = "Notes";
        format = "textarea";
        displayPriority = 60;
      };
    };
    created_by_user_id = {
      type = "integer";
      references = "user(id)";
      metadata = {
        label = "Created by";
        displayPriority = 70;
      };
      relationship = {
        label = "Created by";
        targetLabel = config.refs.user.email;
      };
    };
    created_at = {
      type = "text";
      default = "CURRENT_TIMESTAMP";
      metadata = {
        label = "Created";
        format = "date-time";
        displayPriority = 1000;
      };
    };
  };

  indexes.production_material.by_production_kind_status = {
    columns = [ "production_id" "kind" "status" ];
  };

  indexes.material_version.by_material_status = {
    columns = [ "material_id" "status" ];
  };

  indexes.material_version.unique_material_version = {
    columns = [ "material_id" "version_label" ];
    unique = true;
  };

  audit.entities.production_material = {
    operations = [ "create" "update" "delete" "publish" "archive" ];
    category = "workflow";
    reason = "Production materials determine the current script, score, and operational references.";
  };

  audit.entities.material_version = {
    operations = [ "create" "update" "delete" "mark_current" "supersede" "archive" ];
    category = "workflow";
    reason = "Material versions preserve the authoritative production document history.";
  };

  workflows.groups.materialsLifecycle = {
    label = "Materials lifecycle";
    description = "Publishing, superseding, and archiving production materials.";
    displayPriority = 70;
  };

  operations.production_material = {
    publish = {
      relationships = [];
      policy = {
        label = "Publish material";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "materialsLifecycle";
        transitions = [{
          field = config.refs.production_material.status;
          from = [ "draft" ];
          to = "current";
        }];
        audit.summary = "Published production material";
      };
      guard = E.eq (E.f "status") (E.lit "draft");
      set = { status = "current"; };
      effects = [
        { notify = { channel = "email"; template = "material_published"; to = "participants"; }; }
      ];
    };

    archive = {
      relationships = [];
      policy = {
        label = "Archive material";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "materialsLifecycle";
        transitions = [{
          field = config.refs.production_material.status;
          from = [ "draft" "current" ];
          to = "archived";
        }];
        audit.summary = "Archived production material";
      };
      guard = E.ne (E.f "status") (E.lit "archived");
      set = { status = "archived"; };
    };
  };

  operations.material_version = {
    mark_current = {
      relationships = [];
      policy = {
        label = "Mark version current";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "materialsLifecycle";
        transitions = [{
          field = config.refs.material_version.status;
          from = [ "draft" ];
          to = "current";
        }];
        audit.summary = "Marked material version current";
      };
      guard = E.eq (E.f "status") (E.lit "draft");
      set = { status = "current"; };
    };

    supersede = {
      relationships = [];
      policy = {
        label = "Supersede version";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "materialsLifecycle";
        transitions = [{
          field = config.refs.material_version.status;
          from = [ "current" ];
          to = "superseded";
        }];
        audit.summary = "Superseded material version";
      };
      guard = E.eq (E.f "status") (E.lit "current");
      set = { status = "superseded"; };
    };

    archive = {
      relationships = [];
      policy = {
        label = "Archive version";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "materialsLifecycle";
        transitions = [{
          field = config.refs.material_version.status;
          from = [ "draft" "current" "superseded" ];
          to = "archived";
        }];
        audit.summary = "Archived material version";
      };
      guard = E.ne (E.f "status") (E.lit "archived");
      set = { status = "archived"; };
    };
  };
}
