import { PanelDataBase, PanelDataType } from ".";

export interface EmptyStatePanelData extends PanelDataBase {
  dataType: typeof PanelDataType.Empty;
  data: undefined;
}
