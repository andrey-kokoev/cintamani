use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Measurement {
    pub run: String,
    pub seed: u64,
    pub baseline: String,
    pub parameter_count: usize,
    pub state_dimensionality: usize,
    pub depth: usize,
    pub recurrence: usize,
    pub corruption_type: String,
    pub corruption_severity: f32,
    pub accuracy: f64,
    pub cross_entropy: f64,
    pub entropy: f64,
    pub per_class_accuracy: [f64; 10],
    pub confusion_matrix: [[usize; 10]; 10],
    pub prediction_changes: usize,
    pub wrong_to_right: usize,
    pub right_to_wrong: usize,
    pub wrong_to_right_probability: f64,
    pub right_to_wrong_probability: f64,
    pub state_difference: f64,
    pub optical_norm: f64,
    pub training_seconds: f64,
    pub inference_seconds_per_recurrence: f64,
    #[serde(default)]
    pub confidence_amplifications: usize,
    #[serde(default)]
    pub confidence_amplification_probability: f64,
}

pub fn transition(
    previous: &[usize],
    current: &[usize],
    labels: &[usize],
) -> (usize, usize, usize) {
    previous
        .iter()
        .zip(current)
        .zip(labels)
        .fold((0, 0, 0), |mut a, ((p, c), y)| {
            if p != c {
                a.0 += 1;
            }
            if p != y && c == y {
                a.1 += 1;
            }
            if p == y && c != y {
                a.2 += 1;
            }
            a
        })
}
