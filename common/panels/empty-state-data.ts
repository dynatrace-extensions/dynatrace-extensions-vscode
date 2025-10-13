import { PanelDataBase, PanelDataType } from ".";

export interface EmptyStatePanelData extends PanelDataBase {
  dataType: typeof PanelDataType.EMPTY_STATE_DATA_TYPE;
  data: undefined;
}
