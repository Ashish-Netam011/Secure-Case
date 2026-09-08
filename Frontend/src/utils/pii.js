export function redactPII(text) {
  const patterns = [
    {
      type: "PHONE",
      regex: /(?:\+91[\s-]?)?[6-9]\d{9}/g,
      label: "[REDACTED_PHONE]",
    },

    {
      type: "AADHAAR",
      regex: /\b\d{4}\s\d{4}\s\d{4}\b/g,
      label: "[REDACTED_AADHAAR]",
    },

    {
      type: "EMAIL",
      regex:
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      label: "[REDACTED_EMAIL]",
    },
  ];

  let result = text;
  const found = [];

  patterns.forEach((pattern) => {
    const matches = result.match(pattern.regex);

    if (matches) {
      matches.forEach(() => {
        found.push(pattern.type);
      });

      result = result.replace(
        pattern.regex,
        pattern.label
      );
    }
  });

  return {
    text: result,
    found,
  };
}