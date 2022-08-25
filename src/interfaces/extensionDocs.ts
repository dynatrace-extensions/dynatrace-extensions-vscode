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