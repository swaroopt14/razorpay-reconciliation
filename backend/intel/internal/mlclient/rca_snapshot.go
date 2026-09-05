package mlclient

import "encoding/json"

// UnmarshalRCAClusterResult accepts both the flat RCAClusterResult payload used
// by batch snapshots and the wrapped tenant payload that stores it under
// "cluster_result".
func UnmarshalRCAClusterResult(data []byte) (RCAClusterResult, error) {
	var wrapped struct {
		ClusterResult json.RawMessage `json:"cluster_result"`
	}
	if err := json.Unmarshal(data, &wrapped); err == nil && len(wrapped.ClusterResult) > 0 && string(wrapped.ClusterResult) != "null" {
		var result RCAClusterResult
		if err := json.Unmarshal(wrapped.ClusterResult, &result); err != nil {
			return RCAClusterResult{}, err
		}
		return result, nil
	}

	var result RCAClusterResult
	if err := json.Unmarshal(data, &result); err != nil {
		return RCAClusterResult{}, err
	}
	return result, nil
}
