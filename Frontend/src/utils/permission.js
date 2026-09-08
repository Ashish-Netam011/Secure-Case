const ROLE_PERMISSIONS = {
  Administrator: {
    dashboard: true,

    cases: {
      view: true,
      create: true,
      edit: true,
      remove: true,
    },

    evidence: {
      view: true,
      upload: true,
      review: true,
      remove: true,
      download: true,
    },

    analysis: {
      view: true,
      analyze: true,
      review: true,
    },

    custody: {
      view: true,
      manage: true,
    },

    pii: {
      view: true,
      redact: true,
      review: true,
    },

    reports: {
      view: true,
      generate: true,
      download: true,
    },

    audit: {
      view: true,
      full: true,
    },

    users: {
      view: true,
      manage: true,
    },
  },

  "Investigating Officer": {
    dashboard: true,

    cases: {
      view: true,
      create: false,
      edit: true,
      remove: false,
    },

    evidence: {
      view: true,
      upload: true,
      review: true,
      remove: false,
      download: false,
    },

    analysis: {
      view: true,
      analyze: true,
      review: true,
    },

    custody: {
      view: true,
      manage: false,
    },

    pii: {
      view: true,
      redact: true,
      review: true,
    },

    reports: {
      view: true,
      generate: true,
      download: true,
    },

    audit: {
      view: false,
      full: false,
    },

    users: {
      view: false,
      manage: false,
    },
  },

  "Legal Officer": {
    dashboard: true,

    cases: {
      view: true,
      create: false,
      edit: false,
      remove: false,
    },

    evidence: {
      view: true,
      upload: false,
      review: true,
      remove: false,
      download: false,
    },

    analysis: {
      view: true,
      analyze: true,
      review: true,
    },

    custody: {
      view: true,
      manage: false,
    },

    pii: {
      view: true,
      redact: false,
      review: true,
    },

    reports: {
      view: true,
      generate: true,
      download: true,
    },

    audit: {
      view: false,
      full: false,
    },

    users: {
      view: false,
      manage: false,
    },
  },
};

export function getPermissions(role) {
  return (
    ROLE_PERMISSIONS[role] ||
    ROLE_PERMISSIONS["Legal Officer"]
  );
}

export default ROLE_PERMISSIONS;