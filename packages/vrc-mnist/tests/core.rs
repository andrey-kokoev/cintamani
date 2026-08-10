use burn::tensor::TensorData;
use burn::{backend::Flex, tensor::Tensor};
use cintamani::entropy::{
    configuration::EntropyConfig,
    dynamics,
    modes::{SimulatedVolume, StateOperator, operator_from_config},
    report,
};
use cintamani::experiment::config::ExperimentConfig;
use cintamani::model::recurrent_machine::RecurrentMachine;
use cintamani::physics::complex_field::ComplexField;
use cintamani::{
    data::corruption::{Corruption, corrupt},
    experiment::metrics::transition,
    train::trainer::recurrence_for_batch,
};
use std::fs;

#[test]
fn corruption_is_seeded() {
    let mut a = vec![0.5; 784];
    let mut b = a.clone();
    corrupt(&mut a, &Corruption::Gaussian(0.2), 7);
    corrupt(&mut b, &Corruption::Gaussian(0.2), 7);
    assert_eq!(a, b);
}

#[test]
fn transitions_distinguish_correction_from_damage() {
    assert_eq!(transition(&[3, 4, 1], &[8, 4, 7], &[8, 9, 1]), (2, 1, 1));
}

#[test]
fn variable_recurrence_schedule_is_reproducible() {
    let choices = [1, 2, 4, 8];
    assert_eq!(
        recurrence_for_batch(&choices, 42, 2, 3),
        recurrence_for_batch(&choices, 42, 2, 3)
    );
    assert_ne!(
        recurrence_for_batch(&choices, 42, 2, 3),
        recurrence_for_batch(&choices, 42, 2, 4)
    );
}

#[test]
fn entropy_analysis_is_matrix_free_and_covers_requested_recurrences() {
    let cfg = EntropyConfig::load("configs/entropy-smoke.toml").unwrap();
    let operator = SimulatedVolume::new(&cfg);
    assert_eq!(operator.dimension(), cfg.state_dimension());
    let result = report::characterize(&cfg, &operator).unwrap();
    assert_eq!(
        result
            .recurrent_dynamics
            .rows
            .iter()
            .map(|r| r.recurrence)
            .collect::<Vec<_>>(),
        vec![1, 2, 4, 8, 16, 32]
    );
    assert!(result.transient_state.state_capacity_bits_proxy.is_finite());
    assert_eq!(
        result.configuration.parameter_count,
        cfg.depth * 4 * cfg.kernel_size.pow(2)
    );
}

#[test]
fn every_experiment_config_parses_and_validates() {
    for entry in fs::read_dir("configs").unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|x| x.to_str()) == Some("toml")
            && !path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("entropy-")
        {
            ExperimentConfig::load(&path)
                .unwrap_or_else(|error| panic!("{}: {error:#}", path.display()));
        }
    }
}

#[test]
fn recurrence_reuses_one_parameter_set_and_fixed_state() {
    let device = Default::default();
    let model = RecurrentMachine::<Flex>::new(2, 3, 0.15, 0.99, 0.1, true, 1.0, 1.0, &device);
    let parameter_count = model.parameter_count();
    let trajectory = model.forward(Tensor::ones([1, 1, 28, 28], &device), 8);
    assert_eq!(parameter_count, 72);
    assert_eq!(model.parameter_count(), parameter_count);
    assert_eq!(trajectory.states.len(), 9);
    assert!(
        trajectory
            .states
            .iter()
            .all(|state| state.re.dims() == [1, 1, 28, 28])
    );
    assert!(
        trajectory
            .logits
            .iter()
            .all(|logits| logits.dims() == [1, 10])
    );
}

#[test]
fn complex_multiplication_uses_real_and_imaginary_channels() {
    let device = Default::default();
    let scalar =
        |value| Tensor::<Flex, 4>::from_data(TensorData::new(vec![value], [1, 1, 1, 1]), &device);
    let result = ComplexField::new(scalar(1.0), scalar(2.0))
        .multiply(&ComplexField::new(scalar(3.0), scalar(4.0)));
    assert_eq!(result.re.into_data().to_vec::<f32>().unwrap(), vec![-5.0]);
    assert_eq!(result.im.into_data().to_vec::<f32>().unwrap(), vec![10.0]);
}

#[test]
fn reference_entropy_regimes_are_distinguished() {
    let cases = [
        ("identity", Some(1), 1.0),
        ("period-2", Some(2), 1.0),
        ("period-4", Some(4), 1.0),
        ("contraction", None, 0.8_f64.powi(4)),
        ("expansion", None, 1.2_f64.powi(4)),
    ];
    for (name, cycle, survival) in cases {
        let cfg = EntropyConfig::load(format!("configs/entropy-{name}.toml")).unwrap();
        let op = operator_from_config(&cfg);
        let result = dynamics::analyze_mode(&cfg, op.as_ref(), false);
        assert_eq!(result.limit_cycle_period, cycle, "{name}");
        let measured = result
            .rows
            .iter()
            .find(|x| x.recurrence == 4)
            .unwrap()
            .perturbation_survival;
        assert!((measured - survival).abs() < 1e-3, "{name}: {measured}");
    }
}

#[test]
fn low_rank_and_noise_capacity_calibrate() {
    let low = EntropyConfig::load("configs/entropy-low-rank.toml").unwrap();
    let low_result = report::characterize(&low, operator_from_config(&low).as_ref()).unwrap();
    assert!((low_result.transient_state.effective_rank - 4.0).abs() < 0.2);
    let clean = EntropyConfig::load("configs/entropy-identity.toml").unwrap();
    let noisy = EntropyConfig::load("configs/entropy-noisy-identity.toml").unwrap();
    let clean_capacity = report::characterize(&clean, operator_from_config(&clean).as_ref())
        .unwrap()
        .transient_state
        .state_capacity_bits_proxy;
    let noisy_capacity = report::characterize(&noisy, operator_from_config(&noisy).as_ref())
        .unwrap()
        .transient_state
        .state_capacity_bits_proxy;
    assert!(noisy_capacity < clean_capacity);
}
