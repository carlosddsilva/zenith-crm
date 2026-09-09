import "@xyflow/react/dist/style.css";

import {
  IvrFlowEditor,
} from "@/components/ivr/ivr-flow-editor";

export default async function Page(
  {
    params,
  }: {
    params:
      Promise<{
        id: string;
      }>;
  },
) {
  const {
    id,
  } =
    await params;

  return (
    <IvrFlowEditor
      flowId={id}
    />
  );
}
