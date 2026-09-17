module.exports = new Proxy(
  {},
  {
    get() {
      return [
        "@font-face {",
        "  font-family: 'Inter';",
        "  font-style: normal;",
        "  font-weight: 100 900;",
        "  src: url(https://fonts.gstatic.com/s/inter/v1/e2e.woff2) format('woff2');",
        "}",
      ].join("\n");
    },
  },
);
