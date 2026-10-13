Pod::Spec.new do |s|
  s.name           = 'DepthSensor'
  s.version        = '0.1.0'
  s.summary        = 'LiDAR centre distance for the tree scanner'
  s.description    = 'Reads the LiDAR depth camera to measure the bark distance at breast height.'
  s.author         = 'Foresterie Numérique'
  s.homepage       = 'https://github.com/MOCTAR10/trees'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
end
