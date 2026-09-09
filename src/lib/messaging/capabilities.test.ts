import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assertProviderCanSend,
  messagingCapabilities,
} from "./capabilities";

describe(
  "MessagingProvider capabilities",
  () => {
    it(
      "permite atendimento por texto no Evolution",
      () => {
        expect(() =>
          assertProviderCanSend(
            "evolution",
            {
              to:
                "5566999999999",

              contentType:
                "text",

              text:
                "Olá",

              purpose:
                "service",

              mode:
                "single",
            },
          ),
        ).not.toThrow();
      },
    );

    it(
      "bloqueia marketing no Evolution",
      () => {
        expect(() =>
          assertProviderCanSend(
            "evolution",
            {
              to:
                "5566999999999",

              contentType:
                "text",

              text:
                "Promoção",

              purpose:
                "marketing",

              mode:
                "single",
            },
          ),
        ).toThrow(
          /não permite mensagens de marketing/i,
        );
      },
    );

    it(
      "bloqueia broadcast no Evolution",
      () => {
        expect(() =>
          assertProviderCanSend(
            "evolution",
            {
              to:
                "5566999999999",

              contentType:
                "text",

              text:
                "Mensagem",

              purpose:
                "service",

              mode:
                "broadcast",
            },
          ),
        ).toThrow(
          /não permite broadcast/i,
        );
      },
    );

    it(
      "bloqueia template no Evolution",
      () => {
        expect(() =>
          assertProviderCanSend(
            "evolution",
            {
              to:
                "5566999999999",

              contentType:
                "template",

              templateName:
                "teste",
            },
          ),
        ).toThrow(
          /não permite templates/i,
        );
      },
    );

    it(
      "mantém recursos oficiais no Meta",
      () => {
        expect(
          messagingCapabilities
            .meta.marketing,
        ).toBe(true);

        expect(
          messagingCapabilities
            .meta.broadcast,
        ).toBe(true);

        expect(
          messagingCapabilities
            .meta.templates,
        ).toBe(true);
      },
    );
  },
);
