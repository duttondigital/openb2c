{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.production = {
    id = { type = "integer"; pk = true; auto = true; };
    title = {
      type = "text";
      required = true;
      metadata = {
        label = "Production";
        placeholder = "The Magic Flute";
        displayPriority = 10;
      };
      validation.maxLength = 160;
    };
    season = {
      type = "text";
      metadata = {
        label = "Season";
        placeholder = "Summer 2026";
        displayPriority = 20;
      };
      validation.maxLength = 80;
    };
    description = {
      type = "text";
      metadata = {
        label = "Description";
        format = "textarea";
        displayPriority = 30;
      };
    };
    status = {
      type = "text";
      default = "'planning'";
      metadata = {
        label = "Status";
        displayPriority = 40;
      };
      validation.enum = [ "planning" "active" "completed" "cancelled" ];
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

  tables.performance.production_id = {
    type = "integer";
    required = true;
    references = "production(id)";
    metadata = {
      label = "Production";
      displayPriority = 15;
    };
    relationship = {
      label = "Production";
      description = "Production this performance belongs to.";
      targetLabel = config.refs.production.title;
    };
  };

  tables.production_role = {
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
        description = "Production this role belongs to.";
        targetLabel = config.refs.production.title;
      };
    };
    name = {
      type = "text";
      required = true;
      metadata = {
        label = "Role";
        placeholder = "Pamina";
        displayPriority = 20;
      };
      validation.maxLength = 120;
    };
    category = {
      type = "text";
      default = "'cast'";
      metadata = {
        label = "Category";
        displayPriority = 30;
      };
      validation.enum = [ "cast" "creative" "crew" "orchestra" "admin" ];
    };
    description = {
      type = "text";
      metadata = {
        label = "Description";
        format = "textarea";
        displayPriority = 40;
      };
    };
    required_count = {
      type = "integer";
      default = "1";
      metadata = {
        label = "Required count";
        displayPriority = 50;
      };
      validation.minimum = 1;
    };
    status = {
      type = "text";
      default = "'open'";
      metadata = {
        label = "Status";
        displayPriority = 60;
      };
      validation.enum = [ "open" "filled" "withdrawn" ];
    };
  };

  tables.production_member = {
    id = { type = "integer"; pk = true; auto = true; };
    production_id = {
      type = "integer";
      required = true;
      references = "production(id)";
      relationship = {
        label = "Production";
        targetLabel = config.refs.production.title;
      };
    };
    artist_id = {
      type = "integer";
      required = true;
      references = "artist(id)";
      relationship = {
        label = "Artist";
        description = "Person or performer participating in the production.";
        targetLabel = config.refs.artist.name;
      };
    };
    role_id = {
      type = "integer";
      references = "production_role(id)";
      relationship = {
        label = "Role";
        targetLabel = config.refs.production_role.name;
      };
    };
    responsibility = {
      type = "text";
      metadata = {
        label = "Responsibility";
        placeholder = "Soprano";
        displayPriority = 30;
      };
    };
    status = {
      type = "text";
      default = "'confirmed'";
      metadata = {
        label = "Status";
        displayPriority = 40;
      };
      validation.enum = [ "invited" "confirmed" "declined" "released" ];
    };
  };

  tables.rehearsal = {
    id = { type = "integer"; pk = true; auto = true; };
    production_id = {
      type = "integer";
      required = true;
      references = "production(id)";
      relationship = {
        label = "Production";
        targetLabel = config.refs.production.title;
      };
    };
    title = {
      type = "text";
      required = true;
      metadata = {
        label = "Rehearsal";
        placeholder = "Act I music call";
        displayPriority = 10;
      };
      validation.maxLength = 160;
    };
    venue_id = {
      type = "integer";
      references = "venue(id)";
      metadata = {
        label = "Venue";
        displayPriority = 20;
      };
      relationship = {
        label = "Venue";
        description = "Venue or room reserved for this rehearsal.";
        targetLabel = config.refs.venue.name;
      };
    };
    starts_at = {
      type = "text";
      required = true;
      metadata = {
        label = "Starts";
        format = "date-time";
        displayPriority = 30;
      };
    };
    ends_at = {
      type = "text";
      required = true;
      metadata = {
        label = "Ends";
        format = "date-time";
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
      validation.enum = [ "draft" "published" "completed" "cancelled" ];
    };
    notes = {
      type = "text";
      metadata = {
        label = "Notes";
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

  tables.rehearsal_call = {
    id = { type = "integer"; pk = true; auto = true; };
    rehearsal_id = {
      type = "integer";
      required = true;
      references = "rehearsal(id)";
      relationship = {
        label = "Rehearsal";
        targetLabel = config.refs.rehearsal.title;
      };
    };
    artist_id = {
      type = "integer";
      required = true;
      references = "artist(id)";
      relationship = {
        label = "Participant";
        targetLabel = config.refs.artist.name;
      };
    };
    role_id = {
      type = "integer";
      references = "production_role(id)";
      relationship = {
        label = "Role";
        targetLabel = config.refs.production_role.name;
      };
    };
    call_status = {
      type = "text";
      default = "'called'";
      metadata = {
        label = "Status";
        displayPriority = 30;
      };
      validation.enum = [ "called" "confirmed" "declined" "attended" "absent" ];
    };
    notes = {
      type = "text";
      metadata = {
        label = "Notes";
        format = "textarea";
        displayPriority = 40;
      };
    };
  };

  tables.rehearsal_requirement = {
    id = { type = "integer"; pk = true; auto = true; };
    production_id = {
      type = "integer";
      required = true;
      references = "production(id)";
      relationship = {
        label = "Production";
        targetLabel = config.refs.production.title;
      };
    };
    name = {
      type = "text";
      required = true;
      metadata = {
        label = "Requirement";
        placeholder = "Act I finale";
        displayPriority = 10;
      };
      validation.maxLength = 160;
    };
    category = {
      type = "text";
      default = "'scene'";
      metadata = {
        label = "Category";
        displayPriority = 20;
      };
      validation.enum = [ "scene" "act" "role" "ensemble" "technical" "music" ];
    };
    required_sessions = {
      type = "integer";
      default = "1";
      metadata = {
        label = "Required sessions";
        displayPriority = 30;
      };
      validation.minimum = 1;
    };
    status = {
      type = "text";
      default = "'open'";
      metadata = {
        label = "Status";
        displayPriority = 40;
      };
      validation.enum = [ "open" "scheduled" "covered" "dropped" ];
    };
  };

  tables.rehearsal_coverage = {
    id = { type = "integer"; pk = true; auto = true; };
    requirement_id = {
      type = "integer";
      required = true;
      references = "rehearsal_requirement(id)";
      relationship = {
        label = "Requirement";
        targetLabel = config.refs.rehearsal_requirement.name;
      };
    };
    rehearsal_id = {
      type = "integer";
      required = true;
      references = "rehearsal(id)";
      relationship = {
        label = "Rehearsal";
        targetLabel = config.refs.rehearsal.title;
      };
    };
    status = {
      type = "text";
      default = "'planned'";
      metadata = {
        label = "Status";
        displayPriority = 30;
      };
      validation.enum = [ "planned" "covered" "deferred" ];
    };
    notes = {
      type = "text";
      metadata = {
        label = "Notes";
        format = "textarea";
        displayPriority = 40;
      };
    };
  };

  indexes.production.by_status = {
    columns = [ "status" ];
  };

  indexes.performance.by_production_date = {
    columns = [ "production_id" "date" ];
  };

  indexes.production_role.by_production_category = {
    columns = [ "production_id" "category" ];
  };

  indexes.production_member.unique_production_artist = {
    columns = [ "production_id" "artist_id" ];
    unique = true;
  };

  indexes.rehearsal.by_production_status = {
    columns = [ "production_id" "status" ];
  };

  indexes.rehearsal.by_venue_start = {
    columns = [ "venue_id" "starts_at" ];
  };

  indexes.rehearsal_call.unique_rehearsal_artist = {
    columns = [ "rehearsal_id" "artist_id" ];
    unique = true;
  };

  indexes.rehearsal_requirement.by_production_status = {
    columns = [ "production_id" "status" ];
  };

  indexes.rehearsal_coverage.unique_requirement_rehearsal = {
    columns = [ "requirement_id" "rehearsal_id" ];
    unique = true;
  };

  validations.rehearsal.endsAfterStart = {
    fields = [
      config.refs.rehearsal.starts_at
      config.refs.rehearsal.ends_at
    ];
    expression = E.lt (E.f "starts_at") (E.f "ends_at");
    message = "Rehearsal end time must be after the start time.";
  };

  audit.entities.production = {
    operations = [ "create" "update" "delete" "activate" "complete" "cancel" ];
    category = "workflow";
    reason = "Production state controls private scheduling, calls, and materials.";
  };

  audit.entities.rehearsal = {
    operations = [ "create" "update" "delete" "publish" "complete" "cancel" ];
    category = "workflow";
    reason = "Rehearsal changes affect participant availability and notifications.";
  };

  audit.entities.rehearsal_call = {
    operations = [ "create" "update" "delete" "confirm" "decline" "mark_attended" "mark_absent" ];
    category = "workflow";
    reason = "Rehearsal calls record participant commitments and attendance.";
  };

  audit.entities.rehearsal_requirement = {
    operations = [ "create" "update" "delete" "schedule" "cover" "drop" ];
    category = "workflow";
    reason = "Coverage requirements track whether a production schedule is complete.";
  };

  workflows.groups.productionLifecycle = {
    label = "Production lifecycle";
    description = "Administrative lifecycle for private production planning.";
    displayPriority = 30;
  };

  workflows.groups.rehearsalLifecycle = {
    label = "Rehearsal lifecycle";
    description = "Publishing, completing, and cancelling rehearsal sessions.";
    displayPriority = 40;
  };

  workflows.groups.rehearsalAttendance = {
    label = "Rehearsal attendance";
    description = "Participant call responses and attendance recording.";
    displayPriority = 50;
  };

  workflows.groups.rehearsalCoverage = {
    label = "Rehearsal coverage";
    description = "Coverage tracking for scenes, roles, music, and technical requirements.";
    displayPriority = 60;
  };

  operations.production = {
    activate = {
      relationships = [];
      policy = {
        label = "Activate production";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "productionLifecycle";
        transitions = [{
          field = config.refs.production.status;
          from = [ "planning" ];
          to = "active";
        }];
        audit.summary = "Activated production";
      };
      guard = E.eq (E.f "status") (E.lit "planning");
      set = { status = "active"; };
    };

    complete = {
      relationships = [];
      policy = {
        label = "Complete production";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "productionLifecycle";
        transitions = [{
          field = config.refs.production.status;
          from = [ "active" ];
          to = "completed";
        }];
        audit.summary = "Completed production";
      };
      guard = E.eq (E.f "status") (E.lit "active");
      set = { status = "completed"; };
    };

    cancel = {
      relationships = [];
      policy = {
        label = "Cancel production";
        audiences = [ "staff" "service" ];
        risk = "high";
      };
      workflow = {
        group = "productionLifecycle";
        transitions = [{
          field = config.refs.production.status;
          from = [ "planning" "active" ];
          to = "cancelled";
        }];
        audit.summary = "Cancelled production";
        confirmation = {
          required = true;
          title = "Cancel production";
          message = "This will cancel the production for internal scheduling.";
          confirmLabel = "Cancel production";
          severity = "danger";
        };
      };
      guard = E.and
        (E.ne (E.f "status") (E.lit "completed"))
        (E.ne (E.f "status") (E.lit "cancelled"));
      set = { status = "cancelled"; };
    };
  };

  operations.rehearsal = {
    publish = {
      relationships = [];
      policy = {
        label = "Publish rehearsal";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "rehearsalLifecycle";
        transitions = [{
          field = config.refs.rehearsal.status;
          from = [ "draft" ];
          to = "published";
        }];
        audit.summary = "Published rehearsal";
      };
      guard = E.eq (E.f "status") (E.lit "draft");
      set = { status = "published"; };
      effects = [
        { notify = { channel = "email"; template = "rehearsal_published"; to = "participants"; }; }
      ];
    };

    complete = {
      relationships = [];
      policy = {
        label = "Complete rehearsal";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "rehearsalLifecycle";
        transitions = [{
          field = config.refs.rehearsal.status;
          from = [ "published" ];
          to = "completed";
        }];
        audit.summary = "Completed rehearsal";
      };
      guard = E.eq (E.f "status") (E.lit "published");
      set = { status = "completed"; };
    };

    cancel = {
      relationships = [];
      policy = {
        label = "Cancel rehearsal";
        audiences = [ "staff" "service" ];
        risk = "high";
      };
      workflow = {
        group = "rehearsalLifecycle";
        transitions = [{
          field = config.refs.rehearsal.status;
          from = [ "draft" "published" ];
          to = "cancelled";
        }];
        audit.summary = "Cancelled rehearsal";
        confirmation = {
          required = true;
          title = "Cancel rehearsal";
          message = "This will cancel the rehearsal and notify participants.";
          confirmLabel = "Cancel rehearsal";
          severity = "warning";
        };
      };
      guard = E.and
        (E.ne (E.f "status") (E.lit "completed"))
        (E.ne (E.f "status") (E.lit "cancelled"));
      set = { status = "cancelled"; };
      effects = [
        { notify = { channel = "email"; template = "rehearsal_cancelled"; to = "participants"; }; }
      ];
    };
  };

  operations.rehearsal_call = {
    confirm = {
      relationships = [];
      policy = {
        label = "Confirm call";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "rehearsalAttendance";
        transitions = [{
          field = config.refs.rehearsal_call.call_status;
          from = [ "called" ];
          to = "confirmed";
        }];
        audit.summary = "Confirmed rehearsal call";
      };
      guard = E.eq (E.f "call_status") (E.lit "called");
      set = { call_status = "confirmed"; };
    };

    decline = {
      relationships = [];
      policy = {
        label = "Decline call";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "rehearsalAttendance";
        transitions = [{
          field = config.refs.rehearsal_call.call_status;
          from = [ "called" "confirmed" ];
          to = "declined";
        }];
        audit.summary = "Declined rehearsal call";
      };
      guard = E.or
        (E.eq (E.f "call_status") (E.lit "called"))
        (E.eq (E.f "call_status") (E.lit "confirmed"));
      set = { call_status = "declined"; };
    };

    mark_attended = {
      relationships = [];
      policy = {
        label = "Mark attended";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "rehearsalAttendance";
        transitions = [{
          field = config.refs.rehearsal_call.call_status;
          from = [ "confirmed" ];
          to = "attended";
        }];
        audit.summary = "Marked rehearsal call attended";
      };
      guard = E.eq (E.f "call_status") (E.lit "confirmed");
      set = { call_status = "attended"; };
    };

    mark_absent = {
      relationships = [];
      policy = {
        label = "Mark absent";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "rehearsalAttendance";
        transitions = [{
          field = config.refs.rehearsal_call.call_status;
          from = [ "confirmed" ];
          to = "absent";
        }];
        audit.summary = "Marked rehearsal call absent";
      };
      guard = E.eq (E.f "call_status") (E.lit "confirmed");
      set = { call_status = "absent"; };
    };
  };

  operations.rehearsal_requirement = {
    schedule = {
      relationships = [];
      policy = {
        label = "Schedule requirement";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "rehearsalCoverage";
        transitions = [{
          field = config.refs.rehearsal_requirement.status;
          from = [ "open" ];
          to = "scheduled";
        }];
        audit.summary = "Scheduled rehearsal requirement";
      };
      guard = E.eq (E.f "status") (E.lit "open");
      set = { status = "scheduled"; };
    };

    cover = {
      relationships = [];
      policy = {
        label = "Cover requirement";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "rehearsalCoverage";
        transitions = [{
          field = config.refs.rehearsal_requirement.status;
          from = [ "open" "scheduled" ];
          to = "covered";
        }];
        audit.summary = "Covered rehearsal requirement";
      };
      guard = E.or
        (E.eq (E.f "status") (E.lit "open"))
        (E.eq (E.f "status") (E.lit "scheduled"));
      set = { status = "covered"; };
    };

    drop = {
      relationships = [];
      policy = {
        label = "Drop requirement";
        audiences = [ "staff" "service" ];
        risk = "medium";
      };
      workflow = {
        group = "rehearsalCoverage";
        transitions = [{
          field = config.refs.rehearsal_requirement.status;
          from = [ "open" "scheduled" ];
          to = "dropped";
        }];
        audit.summary = "Dropped rehearsal requirement";
        confirmation = {
          required = true;
          title = "Drop requirement";
          message = "This removes the requirement from coverage tracking.";
          confirmLabel = "Drop requirement";
          severity = "warning";
        };
      };
      guard = E.and
        (E.ne (E.f "status") (E.lit "covered"))
        (E.ne (E.f "status") (E.lit "dropped"));
      set = { status = "dropped"; };
    };
  };

  operations.rehearsal_coverage = {
    mark_covered = {
      relationships = [];
      policy = {
        label = "Mark covered";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "rehearsalCoverage";
        transitions = [{
          field = config.refs.rehearsal_coverage.status;
          from = [ "planned" "deferred" ];
          to = "covered";
        }];
        audit.summary = "Marked requirement coverage complete";
      };
      guard = E.or
        (E.eq (E.f "status") (E.lit "planned"))
        (E.eq (E.f "status") (E.lit "deferred"));
      set = { status = "covered"; };
    };

    defer = {
      relationships = [];
      policy = {
        label = "Defer coverage";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "rehearsalCoverage";
        transitions = [{
          field = config.refs.rehearsal_coverage.status;
          from = [ "planned" ];
          to = "deferred";
        }];
        audit.summary = "Deferred requirement coverage";
      };
      guard = E.eq (E.f "status") (E.lit "planned");
      set = { status = "deferred"; };
    };
  };
}
