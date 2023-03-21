/**
  Copyright 2022 Dynatrace LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

interface AlertDoc {
  name: string;
  description: string;
  entity: string;
}

interface DashboardDoc {
  name: string;
}

interface MetricDoc {
  key: string;
  name: string;
  description: string;
  unit: string;
  tags: string[];
  entities: string[];
}

interface FeatureSetDoc {
  name: string;
  metrics: string[];
}

interface MetricEntityMap {
  metricEntityString: string;
  metrics: MetricDoc[];
}

interface EntityDoc {
  name: string;
  type: string;
  sources: string[];
  metrics: string[];
}